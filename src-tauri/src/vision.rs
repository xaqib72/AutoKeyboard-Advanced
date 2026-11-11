use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};

use image::{imageops, RgbaImage};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
};

use crate::error::{AppError, AppResult};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const WORKER_RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
const WORKER_STARTUP_RESPONSE_TIMEOUT: Duration = Duration::from_secs(120);

pub struct VisionWorker {
    process: Mutex<Option<VisionProcess>>,
}

struct VisionProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    first_request: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResult {
    pub found: bool,
    pub confidence: f64,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeMatchResult {
    pub found: bool,
    pub confidence: f64,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub rotation: u16,
}

impl Default for VisionWorker {
    fn default() -> Self {
        Self {
            process: Mutex::new(None),
        }
    }
}

impl VisionWorker {
    pub async fn match_screen(
        &self,
        template: &str,
        threshold: f64,
        grayscale: bool,
        region: Option<(i32, i32, u32, u32)>,
    ) -> AppResult<MatchResult> {
        if !Path::new(template).is_file() {
            return Err(AppError::coded(
                "ASSET_MISSING",
                format!("Template image '{template}' does not exist."),
            ));
        }
        let capture = tokio::task::spawn_blocking(move || capture_screen(region))
            .await
            .map_err(|error| AppError::coded("CAPTURE_FAILED", error.to_string()))??;
        let request = json!({ "imagePath": capture.path, "templatePath": template, "threshold": threshold, "grayscale": grayscale });
        let response = self.request("match_template", request).await;
        let _ = tokio::fs::remove_file(&capture.path).await;
        let mut result: MatchResult = serde_json::from_value(response?)?;
        result.x += capture.origin_x;
        result.y += capture.origin_y;
        Ok(result)
    }

    pub async fn match_rotated_shape(
        &self,
        source: (i32, i32, u32, u32),
        target: (i32, i32, u32, u32),
        threshold: f64,
    ) -> AppResult<ShapeMatchResult> {
        if !(0.1..=1.0).contains(&threshold) {
            return Err(AppError::coded(
                "INVALID_SHAPE_MATCH",
                "Shape similarity must be between 0.1 and 1.",
            ));
        }
        let source_right = source.0.saturating_add(source.2.min(i32::MAX as u32) as i32);
        let source_bottom = source.1.saturating_add(source.3.min(i32::MAX as u32) as i32);
        let target_right = target.0.saturating_add(target.2.min(i32::MAX as u32) as i32);
        let target_bottom = target.1.saturating_add(target.3.min(i32::MAX as u32) as i32);
        let left = source.0.min(target.0);
        let top = source.1.min(target.1);
        let right = source_right.max(target_right);
        let bottom = source_bottom.max(target_bottom);
        if right <= left || bottom <= top {
            return Err(AppError::coded(
                "INVALID_REGION",
                "Shape and target regions must be positive screen rectangles.",
            ));
        }
        let capture_region = (
            left,
            top,
            u32::try_from(right - left).map_err(|_| AppError::coded("INVALID_REGION", "Capture area is too wide."))?,
            u32::try_from(bottom - top).map_err(|_| AppError::coded("INVALID_REGION", "Capture area is too tall."))?,
        );
        let capture = tokio::task::spawn_blocking(move || capture_screen(Some(capture_region)))
            .await
            .map_err(|error| AppError::coded("CAPTURE_FAILED", error.to_string()))??;
        let relative_region = |region: (i32, i32, u32, u32)| {
            json!({
                "x": region.0 - capture.origin_x,
                "y": region.1 - capture.origin_y,
                "width": region.2,
                "height": region.3,
            })
        };
        let request = json!({
            "imagePath": capture.path,
            "sourceRegion": relative_region(source),
            "targetRegion": relative_region(target),
            "threshold": threshold,
        });
        let response = self.request("match_rotated_shape", request).await;
        let _ = tokio::fs::remove_file(&capture.path).await;
        let mut result: ShapeMatchResult = serde_json::from_value(response?)?;
        result.x += capture.origin_x;
        result.y += capture.origin_y;
        Ok(result)
    }

    pub fn shutdown_now(&self) {
        // The Tauri ExitRequested callback runs on the window event thread. Waiting on an
        // async mutex/runtime from there can deadlock shutdown and leave the window open.
        // A best-effort non-blocking kill is sufficient because Child also has kill_on_drop.
        if let Ok(mut guard) = self.process.try_lock() {
            if let Some(mut process) = guard.take() {
                let _ = process.child.start_kill();
            }
        }
    }

    async fn request(&self, method: &str, params: Value) -> AppResult<Value> {
        let mut guard = self.process.lock().await;
        if guard.is_none() {
            *guard = Some(spawn_worker().await?);
        }
        let process = guard.as_mut().ok_or_else(|| {
            AppError::coded(
                "VISION_WORKER_UNAVAILABLE",
                "Image worker did not initialize.",
            )
        })?;
        if process.child.try_wait()?.is_some() {
            *guard = Some(spawn_worker().await?);
        }
        let process = guard.as_mut().ok_or_else(|| {
            AppError::coded("VISION_WORKER_UNAVAILABLE", "Image worker did not restart.")
        })?;
        let id = uuid::Uuid::new_v4().to_string();
        let line = serde_json::to_string(&json!({ "id": id, "method": method, "params": params }))?;
        let first_request = process.first_request;
        let response_timeout = if first_request {
            WORKER_STARTUP_RESPONSE_TIMEOUT
        } else {
            WORKER_RESPONSE_TIMEOUT
        };
        process.stdin.write_all(line.as_bytes()).await?;
        process.stdin.write_all(b"\n").await?;
        process.stdin.flush().await?;
        let mut response_line = String::new();
        let read = tokio::time::timeout(
            response_timeout,
            process.stdout.read_line(&mut response_line),
        )
        .await;
        let bytes = match read {
            Ok(result) => result?,
            Err(_) => {
                let _ = process.child.start_kill();
                *guard = None;
                return Err(AppError::coded(
                    "VISION_WORKER_TIMEOUT",
                    "Image worker did not respond within 30 seconds.",
                ));
            }
        };
        if bytes == 0 {
            *guard = None;
            return Err(AppError::coded(
                "VISION_WORKER_UNAVAILABLE",
                "Image worker exited unexpectedly.",
            ));
        }
        process.first_request = false;
        let response: Value = serde_json::from_str(&response_line)
            .map_err(|error| AppError::coded("VISION_PROTOCOL_ERROR", error.to_string()))?;
        if response.get("id").and_then(Value::as_str) != Some(&id) {
            return Err(AppError::coded(
                "VISION_PROTOCOL_ERROR",
                "Image worker response ID did not match the request.",
            ));
        }
        if !response.get("ok").and_then(Value::as_bool).unwrap_or(false) {
            let code = response
                .pointer("/error/code")
                .and_then(Value::as_str)
                .unwrap_or("VISION_WORKER_ERROR");
            let message = response
                .pointer("/error/message")
                .and_then(Value::as_str)
                .unwrap_or("Image worker failed.");
            return Err(AppError::coded(
                "VISION_WORKER_ERROR",
                format!("{code}: {message}"),
            ));
        }
        Ok(response.get("result").cloned().unwrap_or(Value::Null))
    }
}

struct CaptureFile {
    path: PathBuf,
    origin_x: i32,
    origin_y: i32,
}

fn capture_screen(region: Option<(i32, i32, u32, u32)>) -> AppResult<CaptureFile> {
    let monitors = xcap::Monitor::all()
        .map_err(|error| AppError::coded("CAPTURE_FAILED", error.to_string()))?;
    if monitors.is_empty() {
        return Err(AppError::coded("CAPTURE_FAILED", "No monitors were found."));
    }
    let mut details = Vec::new();
    for monitor in &monitors {
        details.push((
            monitor.x().map_err(capture_error)?,
            monitor.y().map_err(capture_error)?,
            monitor.width().map_err(capture_error)?,
            monitor.height().map_err(capture_error)?,
        ));
    }
    let min_x = details.iter().map(|item| item.0).min().unwrap_or(0);
    let min_y = details.iter().map(|item| item.1).min().unwrap_or(0);
    let max_x = details
        .iter()
        .map(|item| item.0 + item.2 as i32)
        .max()
        .unwrap_or(0);
    let max_y = details
        .iter()
        .map(|item| item.1 + item.3 as i32)
        .max()
        .unwrap_or(0);
    let width = u32::try_from(max_x - min_x)
        .map_err(|_| AppError::coded("CAPTURE_FAILED", "Invalid virtual desktop width."))?;
    let height = u32::try_from(max_y - min_y)
        .map_err(|_| AppError::coded("CAPTURE_FAILED", "Invalid virtual desktop height."))?;
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > 200_000_000 {
        return Err(AppError::coded(
            "CAPTURE_FAILED",
            "Virtual desktop dimensions are outside the safe capture limit.",
        ));
    }
    let mut canvas = RgbaImage::new(width, height);
    for (monitor, (x, y, _, _)) in monitors.iter().zip(details) {
        let image = monitor.capture_image().map_err(capture_error)?;
        imageops::overlay(
            &mut canvas,
            &image,
            i64::from(x - min_x),
            i64::from(y - min_y),
        );
    }
    let (output, origin_x, origin_y) = if let Some((x, y, requested_width, requested_height)) =
        region
    {
        let local_x = u32::try_from((i64::from(x) - i64::from(min_x)).max(0)).unwrap_or(u32::MAX);
        let local_y = u32::try_from((i64::from(y) - i64::from(min_y)).max(0)).unwrap_or(u32::MAX);
        let crop_width = requested_width.min(width.saturating_sub(local_x));
        let crop_height = requested_height.min(height.saturating_sub(local_y));
        if crop_width == 0 || crop_height == 0 {
            return Err(AppError::coded(
                "CAPTURE_FAILED",
                "Capture region is outside the virtual desktop.",
            ));
        }
        (
            imageops::crop_imm(&canvas, local_x, local_y, crop_width, crop_height).to_image(),
            min_x + local_x as i32,
            min_y + local_y as i32,
        )
    } else {
        (canvas, min_x, min_y)
    };
    let folder = std::env::temp_dir()
        .join("autokeyboard-advanced")
        .join("captures");
    std::fs::create_dir_all(&folder)?;
    let path = folder.join(format!("{}.png", uuid::Uuid::new_v4()));
    output
        .save(&path)
        .map_err(|error| AppError::coded("CAPTURE_FAILED", error.to_string()))?;
    Ok(CaptureFile {
        path,
        origin_x,
        origin_y,
    })
}

fn capture_error(error: xcap::XCapError) -> AppError {
    AppError::coded("CAPTURE_FAILED", error.to_string())
}

async fn spawn_worker() -> AppResult<VisionProcess> {
    let mut command = worker_command()?;
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    let mut child = command.spawn().map_err(|error| {
        AppError::coded(
            "VISION_WORKER_UNAVAILABLE",
            format!("Could not start the image worker: {error}"),
        )
    })?;
    let stdin = child.stdin.take().ok_or_else(|| {
        AppError::coded(
            "VISION_WORKER_UNAVAILABLE",
            "Image worker stdin was unavailable.",
        )
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        AppError::coded(
            "VISION_WORKER_UNAVAILABLE",
            "Image worker stdout was unavailable.",
        )
    })?;
    Ok(VisionProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout),
        first_request: true,
    })
}

fn worker_command() -> AppResult<Command> {
    if let Ok(explicit) = std::env::var("AUTOKEYBOARD_VISION_WORKER") {
        return Ok(Command::new(explicit));
    }
    let exe = std::env::current_exe()?;
    if let Some(folder) = exe.parent() {
        let packaged = folder.join("vision").join("autokeyboard-vision.exe");
        if packaged.is_file() {
            return Ok(Command::new(packaged));
        }
    }
    let current = std::env::current_dir()?;
    let built = current
        .join("vision-worker")
        .join("dist")
        .join("autokeyboard-vision.exe");
    if built.is_file() {
        return Ok(Command::new(built));
    }
    let script = current
        .join("vision-worker")
        .join("src")
        .join("autokeyboard_vision")
        .join("worker.py");
    if script.is_file() {
        let mut command = Command::new("python");
        command.arg(script);
        return Ok(command);
    }
    Err(AppError::coded(
        "VISION_WORKER_UNAVAILABLE",
        "Image worker is not packaged. Run vision-worker/build.ps1 for a full build.",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn shutdown_never_waits_for_a_busy_worker_lock() {
        let worker = VisionWorker::default();
        let _busy = worker.process.lock().await;
        let started = std::time::Instant::now();

        worker.shutdown_now();

        assert!(started.elapsed() < Duration::from_millis(50));
    }
}
