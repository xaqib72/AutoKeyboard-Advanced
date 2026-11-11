use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde_json::{json, Value};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::{
    error::{AppError, AppResult},
    models::Workflow,
};

const MAX_PROJECT_BYTES: u64 = 64 * 1024 * 1024;

pub fn open(path: &Path) -> AppResult<Workflow> {
    if !path.is_file() {
        return Err(AppError::coded(
            "PROJECT_NOT_FOUND",
            format!("Project '{}' does not exist.", path.display()),
        ));
    }
    if path.metadata()?.len() > MAX_PROJECT_BYTES {
        return Err(AppError::coded(
            "PROJECT_TOO_LARGE",
            "Project exceeds the 64 MB safety limit.",
        ));
    }
    if is_json(path) {
        return serde_json::from_reader(File::open(path)?)
            .map_err(|error| AppError::coded("PROJECT_CORRUPT", error.to_string()));
    }
    let mut archive = ZipArchive::new(File::open(path)?)
        .map_err(|error| AppError::coded("PROJECT_CORRUPT", error.to_string()))?;
    let mut workflow_text = String::new();
    archive
        .by_name("workflow.json")
        .map_err(|_| {
            AppError::coded(
                "PROJECT_CORRUPT",
                "workflow.json is missing from the project.",
            )
        })?
        .take(MAX_PROJECT_BYTES)
        .read_to_string(&mut workflow_text)?;
    let mut workflow_value: Value = serde_json::from_str(&workflow_text)
        .map_err(|error| AppError::coded("PROJECT_CORRUPT", error.to_string()))?;
    let extraction_root = std::env::temp_dir()
        .join("autokeyboard-advanced")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&extraction_root)?;
    for index in 0..archive.len() {
        let entry = archive.by_index(index)?;
        let name = entry.name().replace('\\', "/");
        if !name.starts_with("assets/images/") || name.ends_with('/') {
            continue;
        }
        let Some(file_name) = Path::new(&name).file_name() else {
            continue;
        };
        let destination = extraction_root.join(file_name);
        let mut output = File::create(&destination)?;
        std::io::copy(&mut entry.take(MAX_PROJECT_BYTES), &mut output)?;
        replace_string_value(
            &mut workflow_value,
            "templateAsset",
            &name,
            destination.to_string_lossy().as_ref(),
        );
    }
    serde_json::from_value(workflow_value)
        .map_err(|error| AppError::coded("PROJECT_CORRUPT", error.to_string()))
}

pub fn save(path: &Path, workflow: &Workflow) -> AppResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::coded("INVALID_PATH", "Project path has no parent folder."))?;
    fs::create_dir_all(parent)?;
    let temp = temp_path(path);
    if is_json(path) {
        let mut file = File::create(&temp)?;
        serde_json::to_writer_pretty(&mut file, workflow)?;
        file.sync_all()?;
    } else {
        write_archive(&temp, workflow)?;
    }
    atomic_replace(&temp, path)
}

fn write_archive(path: &Path, workflow: &Workflow) -> AppResult<()> {
    let file = File::create(path)?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let now = Utc::now().to_rfc3339();
    writer.start_file("manifest.json", options)?;
    writer.write_all(serde_json::to_string_pretty(&json!({
        "format": "AutoKeyboardAdvanced", "schemaVersion": 1, "appVersion": env!("CARGO_PKG_VERSION"), "createdAt": now, "modifiedAt": now
    }))?.as_bytes())?;

    let mut value = serde_json::to_value(workflow)?;
    let mut assets = Vec::new();
    collect_assets(&mut value, &mut assets);
    writer.start_file("workflow.json", options)?;
    writer.write_all(serde_json::to_string_pretty(&value)?.as_bytes())?;
    for (source, archive_name) in assets {
        writer.start_file(&archive_name, options)?;
        let input = File::open(&source).map_err(|_| {
            AppError::coded(
                "ASSET_MISSING",
                format!("Image asset '{}' cannot be read.", source.display()),
            )
        })?;
        std::io::copy(&mut input.take(MAX_PROJECT_BYTES), &mut writer)?;
    }
    writer.start_file("metadata.json", options)?;
    writer.write_all(b"{\n  \"savedBy\": \"AutoKeyboard Advanced\"\n}\n")?;
    let file = writer.finish()?;
    file.sync_all()?;
    Ok(())
}

fn collect_assets(value: &mut Value, assets: &mut Vec<(PathBuf, String)>) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(asset)) = map.get_mut("templateAsset") {
                let source = PathBuf::from(&*asset);
                if source.is_file() {
                    let clean_name = source
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or("template.png")
                        .replace(['/', '\\'], "_");
                    let archive_name =
                        format!("assets/images/{}-{clean_name}", uuid::Uuid::new_v4());
                    assets.push((source, archive_name.clone()));
                    *asset = archive_name;
                }
            }
            for child in map.values_mut() {
                collect_assets(child, assets);
            }
        }
        Value::Array(values) => values
            .iter_mut()
            .for_each(|child| collect_assets(child, assets)),
        _ => {}
    }
}

fn replace_string_value(value: &mut Value, key: &str, from: &str, to: &str) {
    match value {
        Value::Object(map) => {
            if map.get(key).and_then(Value::as_str) == Some(from) {
                map.insert(key.into(), Value::String(to.into()));
            }
            for child in map.values_mut() {
                replace_string_value(child, key, from, to);
            }
        }
        Value::Array(values) => values
            .iter_mut()
            .for_each(|child| replace_string_value(child, key, from, to)),
        _ => {}
    }
}

fn atomic_replace(temp: &Path, destination: &Path) -> AppResult<()> {
    let backup = destination.with_extension(format!(
        "{}bak",
        destination
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!("{value}."))
            .unwrap_or_default()
    ));
    if destination.exists() {
        fs::copy(destination, &backup)?;
        fs::remove_file(destination)?;
    }
    if let Err(error) = fs::rename(temp, destination) {
        if backup.exists() {
            let _ = fs::copy(&backup, destination);
        }
        return Err(error.into());
    }
    Ok(())
}

fn temp_path(path: &Path) -> PathBuf {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project.akx");
    path.with_file_name(format!(".{name}.{}.tmp", uuid::Uuid::new_v4()))
}

fn is_json(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.to_ascii_lowercase().ends_with(".json"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Action;
    use std::collections::HashMap;

    fn sample() -> Workflow {
        Workflow {
            schema_version: 1,
            name: "Unicode ✓".into(),
            repeat_times: 2,
            actions: vec![Action {
                id: "a1".into(),
                kind: "wait".into(),
                name: "Wait".into(),
                enabled: true,
                delay_after_ms: 0,
                generate: 1,
                params: json!({"durationMs": 1}),
                guard: None,
                retry: None,
                failure_policy: None,
                comment: None,
                extra: HashMap::new(),
            }],
            extra: HashMap::new(),
        }
    }

    #[test]
    fn json_round_trip() {
        let path = std::env::temp_dir().join(format!("{}.akx.json", uuid::Uuid::new_v4()));
        save(&path, &sample()).unwrap();
        let loaded = open(&path).unwrap();
        assert_eq!(loaded.name, "Unicode ✓");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn zip_round_trip() {
        let path = std::env::temp_dir().join(format!("{}.akx", uuid::Uuid::new_v4()));
        save(&path, &sample()).unwrap();
        let loaded = open(&path).unwrap();
        assert_eq!(loaded.actions.len(), 1);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn saving_again_replaces_the_existing_project() {
        let path = std::env::temp_dir().join(format!("{}.akx", uuid::Uuid::new_v4()));
        let first = sample();
        save(&path, &first).unwrap();

        let mut replacement = sample();
        replacement.name = "Replacement".into();
        replacement.repeat_times = 7;
        save(&path, &replacement).unwrap();

        let loaded = open(&path).unwrap();
        assert_eq!(loaded.name, "Replacement");
        assert_eq!(loaded.repeat_times, 7);
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(path.with_extension("akx.bak"));
    }
}
