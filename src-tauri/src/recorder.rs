use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use crate::error::{AppError, AppResult};

pub struct RecorderHandle {
    running: Arc<AtomicBool>,
}

impl RecorderHandle {
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }
}

pub fn start(app: tauri::AppHandle) -> AppResult<RecorderHandle> {
    platform::start(app)
}

#[cfg(windows)]
mod platform {
    use super::*;
    use serde_json::json;
    use std::{
        collections::HashSet,
        thread,
        time::{Duration, Instant},
    };
    use tauri::{Emitter, Manager};
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::{
        Input::KeyboardAndMouse::{
            GetAsyncKeyState, VK_BACK, VK_CONTROL, VK_DELETE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1,
            VK_F12, VK_HOME, VK_INSERT, VK_LEFT, VK_MENU, VK_NEXT, VK_PRIOR, VK_RETURN, VK_RIGHT,
            VK_SHIFT, VK_SPACE, VK_TAB, VK_UP,
        },
        WindowsAndMessaging::GetCursorPos,
    };

    pub fn start(app: tauri::AppHandle) -> AppResult<RecorderHandle> {
        let running = Arc::new(AtomicBool::new(true));
        let worker_flag = running.clone();
        thread::Builder::new()
            .name("autokeyboard-recorder".into())
            .spawn(move || {
                let mut down: HashSet<u16> = (1u16..=254)
                    .filter(|code| unsafe { GetAsyncKeyState(i32::from(*code)) } < 0)
                    .collect();
                let mut last_event = Instant::now();
                'recording: while worker_flag.load(Ordering::SeqCst) {
                    for code in 1u16..=254 {
                        let pressed = unsafe { GetAsyncKeyState(i32::from(code)) } < 0;
                        let was_pressed = down.contains(&code);
                        if pressed && !was_pressed {
                            down.insert(code);
                            if code == VK_ESCAPE.0 {
                                worker_flag.store(false, Ordering::SeqCst);
                                break 'recording;
                            }
                            if let Some(action) =
                                recorded_action(code, last_event.elapsed().as_millis() as u64)
                            {
                                let _ = app.emit("recorder_action", action);
                                last_event = Instant::now();
                            }
                        } else if !pressed && was_pressed {
                            down.remove(&code);
                        }
                    }
                    thread::sleep(Duration::from_millis(8));
                }
                let _ = app.emit("recorder_state", json!({ "recording": false }));
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            })
            .map_err(|error| AppError::coded("RECORDER_START_FAILED", error.to_string()))?;
        Ok(RecorderHandle { running })
    }

    fn recorded_action(code: u16, delay: u64) -> Option<serde_json::Value> {
        let id = uuid::Uuid::new_v4().to_string();
        let delay = delay.min(60_000);
        let mouse = match code {
            0x01 => Some(("left", 1)),
            0x02 => Some(("right", 1)),
            0x04 => Some(("middle", 1)),
            _ => None,
        };
        if let Some((button, click_count)) = mouse {
            let mut point = POINT::default();
            if unsafe { GetCursorPos(&mut point) }.is_err() {
                return None;
            }
            return Some(json!({
                "id": id, "type": "mouse", "name": format!("Click {button} button"), "enabled": true,
                "delayAfterMs": delay, "generate": 1,
                "params": { "kind": "click", "button": button, "clickCount": click_count, "x": point.x, "y": point.y, "coordinateSpace": "virtual_screen" }
            }));
        }
        if [VK_CONTROL.0, VK_SHIFT.0, VK_MENU.0, VK_ESCAPE.0, VK_F12.0].contains(&code) {
            return None;
        }
        let key = key_name(code)?;
        let control = unsafe { GetAsyncKeyState(i32::from(VK_CONTROL.0)) } < 0;
        let alt = unsafe { GetAsyncKeyState(i32::from(VK_MENU.0)) } < 0;
        let shift = unsafe { GetAsyncKeyState(i32::from(VK_SHIFT.0)) } < 0;
        let mut chord = Vec::new();
        if control {
            chord.push("Ctrl".to_owned());
        }
        if alt {
            chord.push("Alt".to_owned());
        }
        if shift {
            chord.push("Shift".to_owned());
        }
        chord.push(key);
        let keys = chord.join("+");
        Some(json!({
            "id": id, "type": "keyboard", "name": keys, "enabled": true, "delayAfterMs": delay,
            "generate": 1, "params": { "keys": keys, "mode": "press", "interRepeatDelayMs": 0 }
        }))
    }

    fn key_name(code: u16) -> Option<String> {
        if (b'A' as u16..=b'Z' as u16).contains(&code)
            || (b'0' as u16..=b'9' as u16).contains(&code)
        {
            return char::from_u32(u32::from(code)).map(|value| value.to_string());
        }
        if (VK_F1.0..=VK_F1.0 + 23).contains(&code) {
            return Some(format!("F{}", code - VK_F1.0 + 1));
        }
        let name = match code {
            value if value == VK_RETURN.0 => "Enter",
            value if value == VK_TAB.0 => "Tab",
            value if value == VK_ESCAPE.0 => "Escape",
            value if value == VK_SPACE.0 => "Space",
            value if value == VK_BACK.0 => "Backspace",
            value if value == VK_DELETE.0 => "Delete",
            value if value == VK_INSERT.0 => "Insert",
            value if value == VK_HOME.0 => "Home",
            value if value == VK_END.0 => "End",
            value if value == VK_PRIOR.0 => "PageUp",
            value if value == VK_NEXT.0 => "PageDown",
            value if value == VK_LEFT.0 => "Left",
            value if value == VK_RIGHT.0 => "Right",
            value if value == VK_UP.0 => "Up",
            value if value == VK_DOWN.0 => "Down",
            _ => return None,
        };
        Some(name.into())
    }

    #[cfg(test)]
    mod tests {
        use super::key_name;
        use windows::Win32::UI::Input::KeyboardAndMouse::{VK_BACK, VK_DELETE, VK_RETURN};

        #[test]
        fn functional_editing_keys_are_recordable() {
            assert_eq!(key_name(VK_BACK.0).as_deref(), Some("Backspace"));
            assert_eq!(key_name(VK_DELETE.0).as_deref(), Some("Delete"));
            assert_eq!(key_name(VK_RETURN.0).as_deref(), Some("Enter"));
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    pub fn start(_: tauri::AppHandle) -> AppResult<RecorderHandle> {
        Err(AppError::coded(
            "PLATFORM_UNSUPPORTED",
            "Recording is available on Windows.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::RecorderHandle;
    use std::sync::{atomic::AtomicBool, Arc};

    #[test]
    fn recorder_handle_reports_when_it_has_been_stopped() {
        let handle = RecorderHandle {
            running: Arc::new(AtomicBool::new(true)),
        };
        assert!(handle.is_running());
        handle.stop();
        assert!(!handle.is_running());
    }
}
