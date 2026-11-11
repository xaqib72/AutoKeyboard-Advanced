mod engine;
mod error;
mod models;
mod native;
mod project;
mod recorder;
mod validation;
mod vision;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use error::{AppError, AppResult};
use models::{RunState, ValidationIssue, Workflow};
use native::NativeInput;
use serde_json::{json, Value};
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use vision::VisionWorker;

struct RuntimeManager {
    active: Mutex<Option<Arc<engine::RunControl>>>,
}

#[derive(Clone, Copy, Default)]
struct LaunchHotkeys {
    start: Option<Shortcut>,
    stop: Option<Shortcut>,
}

struct AppState {
    runtime: Arc<RuntimeManager>,
    input: Arc<NativeInput>,
    vision: Arc<VisionWorker>,
    recorder: Mutex<Option<recorder::RecorderHandle>>,
    launch_hotkeys: Mutex<LaunchHotkeys>,
}

fn emergency_shortcut() -> Shortcut {
    Shortcut::new(
        Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT),
        Code::F12,
    )
}

fn parse_launch_shortcut(value: &str) -> AppResult<Option<Shortcut>> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let shortcut = value.parse::<Shortcut>().map_err(|error| {
        AppError::coded(
            "INVALID_HOTKEY",
            format!("Hotkey '{value}' is invalid: {error}"),
        )
    })?;
    if shortcut == emergency_shortcut() {
        return Err(AppError::coded(
            "HOTKEY_RESERVED",
            "Ctrl+Alt+Shift+F12 is reserved for emergency stop.",
        ));
    }
    Ok(Some(shortcut))
}

fn register_launch_hotkeys(app: &tauri::AppHandle, hotkeys: LaunchHotkeys) -> Result<(), String> {
    if let Some(start) = hotkeys.start {
        app.global_shortcut()
            .register(start)
            .map_err(|error| error.to_string())?;
    }
    if let Some(stop) = hotkeys.stop.filter(|stop| Some(*stop) != hotkeys.start) {
        if let Err(error) = app.global_shortcut().register(stop) {
            if let Some(start) = hotkeys.start {
                let _ = app.global_shortcut().unregister(start);
            }
            return Err(error.to_string());
        }
    }
    Ok(())
}

fn unregister_launch_hotkeys(app: &tauri::AppHandle, hotkeys: LaunchHotkeys) {
    if let Some(start) = hotkeys.start {
        let _ = app.global_shortcut().unregister(start);
    }
    if let Some(stop) = hotkeys.stop.filter(|stop| Some(*stop) != hotkeys.start) {
        let _ = app.global_shortcut().unregister(stop);
    }
}

#[tauri::command]
fn hotkeys_configure(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    start_hotkey: String,
    stop_hotkey: String,
) -> AppResult<()> {
    let next = LaunchHotkeys {
        start: parse_launch_shortcut(&start_hotkey)?,
        stop: parse_launch_shortcut(&stop_hotkey)?,
    };
    let previous = *state
        .launch_hotkeys
        .lock()
        .map_err(|_| AppError::coded("HOTKEY_STATE_ERROR", "Hotkey lock was poisoned."))?;
    unregister_launch_hotkeys(&app, previous);
    if let Err(error) = register_launch_hotkeys(&app, next) {
        let _ = register_launch_hotkeys(&app, previous);
        return Err(AppError::coded(
            "HOTKEY_REGISTRATION_FAILED",
            format!("Could not register the selected hotkey: {error}"),
        ));
    }
    *state
        .launch_hotkeys
        .lock()
        .map_err(|_| AppError::coded("HOTKEY_STATE_ERROR", "Hotkey lock was poisoned."))? = next;
    Ok(())
}

#[tauri::command]
fn ping() -> String {
    format!(
        "AutoKeyboard Advanced native core {}",
        env!("CARGO_PKG_VERSION")
    )
}

#[tauri::command]
async fn project_open(path: String) -> AppResult<Workflow> {
    tokio::task::spawn_blocking(move || project::open(&PathBuf::from(path)))
        .await
        .map_err(|error| AppError::coded("PROJECT_OPEN_FAILED", error.to_string()))?
}

#[tauri::command]
async fn project_save(path: String, workflow: Workflow) -> AppResult<()> {
    let issues = validation::validate(&workflow);
    if !issues.is_empty() {
        return Err(AppError::coded(
            "VALIDATION_ERROR",
            format!("Project has {} validation problem(s).", issues.len()),
        ));
    }
    tokio::task::spawn_blocking(move || project::save(&PathBuf::from(path), &workflow))
        .await
        .map_err(|error| AppError::coded("PROJECT_SAVE_FAILED", error.to_string()))?
}

#[tauri::command]
fn project_validate(workflow: Workflow) -> Vec<ValidationIssue> {
    validation::validate(&workflow)
}

#[tauri::command]
async fn run_start(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workflow: Workflow,
) -> AppResult<String> {
    let issues = validation::validate(&workflow);
    if !issues.is_empty() {
        return Err(AppError::coded(
            "VALIDATION_ERROR",
            format!("Workflow has {} validation problem(s).", issues.len()),
        ));
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::coded("WINDOW_UNAVAILABLE", "The main window is unavailable."))?;
    let control = engine::RunControl::new();
    {
        let mut active =
            state.runtime.active.lock().map_err(|_| {
                AppError::coded("RUNTIME_STATE_ERROR", "Runtime lock was poisoned.")
            })?;
        if active.as_ref().is_some_and(|run| !run.is_cancelled()) {
            return Err(AppError::coded(
                "RUN_ALREADY_ACTIVE",
                "Only one workflow can run at a time.",
            ));
        }
        *active = Some(control.clone());
    }
    let run_id = control.run_id.clone();
    let runtime = state.runtime.clone();
    let input = state.input.clone();
    let vision = state.vision.clone();
    if let Err(error) = window.minimize() {
        if let Ok(mut active) = state.runtime.active.lock() {
            *active = None;
        }
        return Err(AppError::coded("WINDOW_MINIMIZE_FAILED", error.to_string()));
    }
    tokio::time::sleep(std::time::Duration::from_millis(180)).await;
    let completion_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = engine::execute(app, workflow, control.clone(), input, vision).await;
        if let Ok(mut active) = runtime.active.lock() {
            if active
                .as_ref()
                .is_some_and(|current| current.run_id == control.run_id)
            {
                *active = None;
            }
        }
        if let Some(window) = completion_app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
    Ok(run_id)
}

#[tauri::command]
fn run_pause(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let active = state
        .runtime
        .active
        .lock()
        .map_err(|_| AppError::coded("RUNTIME_STATE_ERROR", "Runtime lock was poisoned."))?;
    let run = active
        .as_ref()
        .ok_or_else(|| AppError::coded("NO_ACTIVE_RUN", "No workflow is running."))?;
    run.pause();
    let _ = app.emit(
        "run_state",
        json!({ "runId": run.run_id, "state": RunState::Paused, "message": "Workflow paused" }),
    );
    Ok(())
}

#[tauri::command]
fn run_resume(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let active = state
        .runtime
        .active
        .lock()
        .map_err(|_| AppError::coded("RUNTIME_STATE_ERROR", "Runtime lock was poisoned."))?;
    let run = active
        .as_ref()
        .ok_or_else(|| AppError::coded("NO_ACTIVE_RUN", "No workflow is paused."))?;
    run.resume();
    let _ = app.emit(
        "run_state",
        json!({ "runId": run.run_id, "state": RunState::Running, "message": "Workflow resumed" }),
    );
    Ok(())
}

#[tauri::command]
fn run_stop(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    stop_active_run(&app, &state);
    Ok(())
}

fn stop_active_run(app: &tauri::AppHandle, state: &AppState) {
    if let Ok(active) = state.runtime.active.lock() {
        if let Some(run) = active.as_ref() {
            run.cancel();
            state.input.release_all();
            let _ = app.emit("run_state", json!({ "runId": run.run_id, "state": RunState::Stopping, "message": "Emergency stop requested" }));
        }
    }
}

async fn capture_screen_points(app: &tauri::AppHandle, count: usize) -> AppResult<Vec<(i32, i32)>> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::coded("WINDOW_UNAVAILABLE", "The main window is unavailable."))?;
    window
        .minimize()
        .map_err(|error| AppError::coded("WINDOW_MINIMIZE_FAILED", error.to_string()))?;
    tokio::time::sleep(std::time::Duration::from_millis(180)).await;
    let result = tokio::task::spawn_blocking(move || native::capture_click_points(count)).await;
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    result.map_err(|error| AppError::coded("CAPTURE_FAILED", error.to_string()))?
}

#[tauri::command]
async fn capture_coordinate(app: tauri::AppHandle) -> AppResult<Value> {
    let (x, y) = capture_screen_points(&app, 1).await?[0];
    Ok(json!({ "x": x, "y": y }))
}

#[tauri::command]
async fn capture_swipe_points(app: tauri::AppHandle) -> AppResult<Value> {
    let points = capture_screen_points(&app, 2).await?;
    let (start_x, start_y) = points[0];
    let (end_x, end_y) = points[1];
    Ok(json!({
        "startX": start_x,
        "startY": start_y,
        "endX": end_x,
        "endY": end_y
    }))
}

#[tauri::command]
async fn capture_region(app: tauri::AppHandle) -> AppResult<Value> {
    let points = capture_screen_points(&app, 4).await?;
    let (x, y, width, height) = region_from_four_corners(&points)?;
    Ok(json!({
        "x": x,
        "y": y,
        "width": width,
        "height": height
    }))
}

fn region_from_four_corners(points: &[(i32, i32)]) -> AppResult<(i32, i32, u32, u32)> {
    if points.len() != 4 {
        return Err(AppError::coded(
            "INVALID_REGION",
            "Exactly four corner coordinates are required.",
        ));
    }
    let min_x = points.iter().map(|(x, _)| *x).min().unwrap_or(0);
    let max_x = points.iter().map(|(x, _)| *x).max().unwrap_or(0);
    let min_y = points.iter().map(|(_, y)| *y).min().unwrap_or(0);
    let max_y = points.iter().map(|(_, y)| *y).max().unwrap_or(0);
    let width = min_x.abs_diff(max_x);
    let height = min_y.abs_diff(max_y);
    if width == 0 || height == 0 {
        return Err(AppError::coded(
            "INVALID_REGION",
            "The four selected corners must enclose an area with non-zero width and height.",
        ));
    }
    Ok((min_x, min_y, width, height))
}

#[tauri::command]
fn capture_pixel(x: Option<i32>, y: Option<i32>) -> AppResult<Value> {
    let (x, y) = match (x, y) {
        (Some(x), Some(y)) => (x, y),
        _ => native::cursor_position()?,
    };
    let rgb = native::pixel(x, y)?;
    Ok(
        json!({ "x": x, "y": y, "rgb": rgb, "hex": format!("#{:02X}{:02X}{:02X}", rgb[0], rgb[1], rgb[2]) }),
    )
}

#[tauri::command]
async fn condition_test(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    condition: Value,
) -> AppResult<Value> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::coded("WINDOW_UNAVAILABLE", "The main window is unavailable."))?;
    window
        .minimize()
        .map_err(|error| AppError::coded("WINDOW_MINIMIZE_FAILED", error.to_string()))?;
    tokio::time::sleep(std::time::Duration::from_millis(220)).await;
    let result = engine::test_condition(&condition, &state.vision).await;
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    result
}

#[tauri::command]
fn diagnostics_get(state: State<'_, AppState>) -> HashMap<String, String> {
    let hotkeys = state
        .launch_hotkeys
        .lock()
        .map(|hotkeys| *hotkeys)
        .unwrap_or_default();
    HashMap::from([
        ("App version".into(), env!("CARGO_PKG_VERSION").into()),
        ("Platform".into(), std::env::consts::OS.into()),
        ("Architecture".into(), std::env::consts::ARCH.into()),
        ("Native runtime".into(), "Ready".into()),
        ("Emergency stop".into(), "Ctrl+Alt+Shift+F12".into()),
        (
            "Global start".into(),
            hotkeys
                .start
                .map(|shortcut| shortcut.to_string())
                .unwrap_or_else(|| "Not armed".into()),
        ),
        (
            "Global stop".into(),
            hotkeys
                .stop
                .map(|shortcut| shortcut.to_string())
                .unwrap_or_else(|| "Not armed".into()),
        ),
        (
            "Vision worker".into(),
            "Lazy — starts on first image action".into(),
        ),
    ])
}

#[tauri::command]
async fn recorder_start(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    {
        let mut recorder = state
            .recorder
            .lock()
            .map_err(|_| AppError::coded("RECORDER_STATE_ERROR", "Recorder lock was poisoned."))?;
        if recorder.as_ref().is_some_and(|handle| handle.is_running()) {
            return Err(AppError::coded(
                "RECORDER_ALREADY_ACTIVE",
                "The recorder is already running.",
            ));
        }
        // Remove a stale handle left behind when Escape stopped the worker itself.
        *recorder = None;
    }

    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::coded("WINDOW_UNAVAILABLE", "The main window is unavailable."))?;
    window
        .minimize()
        .map_err(|error| AppError::coded("WINDOW_MINIMIZE_FAILED", error.to_string()))?;

    // This delay must run natively. WebView2 can suspend JavaScript timers as soon
    // as it is minimized, which previously prevented the recorder from starting.
    tokio::time::sleep(std::time::Duration::from_millis(180)).await;
    let handle = match recorder::start(app.clone()) {
        Ok(handle) => handle,
        Err(error) => {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            return Err(error);
        }
    };
    match state.recorder.lock() {
        Ok(mut recorder) => *recorder = Some(handle),
        Err(_) => {
            handle.stop();
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            return Err(AppError::coded(
                "RECORDER_STATE_ERROR",
                "Recorder lock was poisoned.",
            ));
        }
    }
    let _ = app.emit("recorder_state", json!({ "recording": true }));
    Ok(())
}

#[tauri::command]
fn recorder_stop(app: tauri::AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    if let Some(recorder) = state
        .recorder
        .lock()
        .map_err(|_| AppError::coded("RECORDER_STATE_ERROR", "Recorder lock was poisoned."))?
        .take()
    {
        recorder.stop();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

pub fn run() {
    let state = AppState {
        runtime: Arc::new(RuntimeManager {
            active: Mutex::new(None),
        }),
        input: Arc::new(NativeInput::default()),
        vision: Arc::new(VisionWorker::default()),
        recorder: Mutex::new(None),
        launch_hotkeys: Mutex::new(LaunchHotkeys::default()),
    };
    let emergency_stop = emergency_shortcut();
    let handler_shortcut = emergency_stop;
    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                if shortcut == &handler_shortcut {
                    let state = app.state::<AppState>();
                    stop_active_run(app, &state);
                    return;
                }
                let state = app.state::<AppState>();
                if state.recorder.lock().is_ok_and(|recorder| {
                    recorder.as_ref().is_some_and(|handle| handle.is_running())
                }) {
                    return;
                }
                let hotkeys = state
                    .launch_hotkeys
                    .lock()
                    .map(|hotkeys| *hotkeys)
                    .unwrap_or_default();
                let starts = hotkeys.start.as_ref() == Some(shortcut);
                let stops = hotkeys.stop.as_ref() == Some(shortcut);
                if starts && stops {
                    let _ = app.emit("global_toggle_requested", ());
                } else if starts {
                    let _ = app.emit("global_start_requested", ());
                } else if stops {
                    stop_active_run(app, &state);
                }
            }
        })
        .build();
    let app = tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(plugin)
        .setup(move |app| {
            let icon = image::load_from_memory(include_bytes!("../icons/icon.png"))?.into_rgba8();
            let (width, height) = icon.dimensions();
            app.get_webview_window("main")
                .ok_or("WINDOW_UNAVAILABLE: The main window is unavailable.")?
                .set_icon(tauri::image::Image::new_owned(
                    icon.into_raw(),
                    width,
                    height,
                ))?;
            app.global_shortcut()
                .register(emergency_stop)
                .map_err(|error| format!("HOTKEY_REGISTRATION_FAILED: {error}"))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            project_open,
            project_save,
            project_validate,
            run_start,
            run_pause,
            run_resume,
            run_stop,
            hotkeys_configure,
            recorder_start,
            recorder_stop,
            capture_coordinate,
            capture_swipe_points,
            capture_region,
            capture_pixel,
            condition_test,
            diagnostics_get
        ])
        .build(tauri::generate_context!())
        .expect("failed to build AutoKeyboard Advanced");
    app.run(|handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            let state = handle.state::<AppState>();
            stop_active_run(handle, &state);
            if let Ok(mut recorder) = state.recorder.lock() {
                if let Some(handle) = recorder.take() {
                    handle.stop();
                }
            }
            state.vision.shutdown_now();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_hotkeys_parse_and_emergency_key_is_reserved() {
        assert!(parse_launch_shortcut("").unwrap().is_none());
        assert_eq!(
            parse_launch_shortcut("F3").unwrap(),
            Some(Shortcut::new(None, Code::F3))
        );
        assert!(parse_launch_shortcut("Ctrl+Alt+Shift+F12").is_err());
    }

    #[test]
    fn four_corners_create_an_order_independent_bounding_region() {
        assert_eq!(
            region_from_four_corners(&[(500, 120), (90, 390), (100, 100), (480, 400)]).unwrap(),
            (90, 100, 410, 300)
        );
        assert_eq!(
            region_from_four_corners(&[(-900, -200), (-300, -210), (-310, 300), (-890, 290)])
                .unwrap(),
            (-900, -210, 600, 510)
        );
    }

    #[test]
    fn four_corner_region_rejects_missing_or_flat_areas() {
        assert!(region_from_four_corners(&[(0, 0), (10, 0)]).is_err());
        assert!(region_from_four_corners(&[(10, 0), (10, 20), (10, 40), (10, 60)]).is_err());
    }
}
