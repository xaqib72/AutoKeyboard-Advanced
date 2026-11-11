use std::{collections::HashSet, sync::Mutex};

use crate::error::{AppError, AppResult};

#[derive(Default)]
pub struct NativeInput {
    held_keys: Mutex<HashSet<u16>>,
    held_buttons: Mutex<HashSet<String>>,
}

impl NativeInput {
    pub fn keyboard(&self, keys: &str, mode: &str) -> AppResult<()> {
        platform::keyboard(self, keys, mode)
    }
    pub fn mouse(
        &self,
        x: i32,
        y: i32,
        button: &str,
        kind: &str,
        click_count: u32,
    ) -> AppResult<()> {
        platform::mouse(self, x, y, button, kind, click_count)
    }
    pub fn scroll(&self, x: i32, y: i32, delta: i32) -> AppResult<()> {
        platform::scroll(x, y, delta)
    }
    pub fn text(&self, text: &str, clear_first: bool, method: &str) -> AppResult<()> {
        platform::text(self, text, clear_first, method)
    }
    pub fn release_all(&self) {
        platform::release_all(self);
    }
}

pub fn cursor_position() -> AppResult<(i32, i32)> {
    platform::cursor_position()
}
pub fn capture_click_points(count: usize) -> AppResult<Vec<(i32, i32)>> {
    platform::capture_click_points(count)
}
pub fn pixel(x: i32, y: i32) -> AppResult<[u8; 3]> {
    platform::pixel(x, y)
}
pub fn window_matches(
    title: &str,
    mode: &str,
    process: &str,
    active_only: bool,
) -> AppResult<bool> {
    platform::window_matches(title, mode, process, active_only)
}
pub fn window_action(title: &str, mode: &str, process: &str, operation: &str) -> AppResult<()> {
    platform::window_action(title, mode, process, operation)
}
pub fn resolve_coordinate(x: i32, y: i32, space: &str, title: &str) -> AppResult<(i32, i32)> {
    platform::resolve_coordinate(x, y, space, title)
}

#[cfg(windows)]
mod platform {
    use super::*;
    use clipboard_win::set_clipboard_string;
    use regex::Regex;
    use windows::{
        core::{BOOL, PWSTR},
        Win32::{
            Foundation::{CloseHandle, HWND, LPARAM, POINT},
            Graphics::Gdi::{ClientToScreen, GetDC, GetPixel, ReleaseDC, CLR_INVALID},
            System::Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
            UI::{
                Input::KeyboardAndMouse::{
                    GetAsyncKeyState, MapVirtualKeyW, SendInput, VkKeyScanW, INPUT, INPUT_0,
                    INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYBD_EVENT_FLAGS,
                    KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, KEYEVENTF_UNICODE,
                    MAPVK_VK_TO_VSC_EX, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
                    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_RIGHTDOWN,
                    MOUSEEVENTF_RIGHTUP, MOUSEEVENTF_WHEEL, MOUSEINPUT, MOUSE_EVENT_FLAGS,
                    VIRTUAL_KEY, VK_ADD, VK_APPS, VK_BACK, VK_CAPITAL, VK_CONTROL, VK_DECIMAL,
                    VK_DELETE, VK_DIVIDE, VK_DOWN, VK_END, VK_ESCAPE, VK_F1, VK_HOME, VK_INSERT,
                    VK_LBUTTON, VK_LEFT, VK_LWIN, VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE,
                    VK_MEDIA_PREV_TRACK, VK_MEDIA_STOP, VK_MENU, VK_MULTIPLY, VK_NEXT, VK_NUMLOCK,
                    VK_NUMPAD0, VK_PAUSE, VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SCROLL, VK_SHIFT,
                    VK_SNAPSHOT, VK_SPACE, VK_SUBTRACT, VK_TAB, VK_UP, VK_VOLUME_DOWN,
                    VK_VOLUME_MUTE, VK_VOLUME_UP,
                },
                WindowsAndMessaging::{
                    EnumWindows, GetCursorPos, GetForegroundWindow, GetWindowRect,
                    GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
                    IsWindowVisible, SetCursorPos, SetForegroundWindow, ShowWindow, SW_MINIMIZE,
                    SW_RESTORE,
                },
            },
        },
    };

    pub fn keyboard(input: &NativeInput, keys: &str, mode: &str) -> AppResult<()> {
        let virtual_keys = parse_chord(keys)?;
        match mode {
            "down" => {
                for key in &virtual_keys {
                    send_key(*key, false)?;
                    input.held_keys.lock().map_err(lock_error)?.insert(key.0);
                }
            }
            "up" => {
                for key in virtual_keys.iter().rev() {
                    send_key(*key, true)?;
                    input.held_keys.lock().map_err(lock_error)?.remove(&key.0);
                }
            }
            _ => {
                for key in &virtual_keys {
                    send_key(*key, false)?;
                    input.held_keys.lock().map_err(lock_error)?.insert(key.0);
                }
                // A real key has a short down-time. Some applications (especially
                // Android emulators) ignore a down/up pair delivered in the same tick.
                std::thread::sleep(std::time::Duration::from_millis(24));
                for key in virtual_keys.iter().rev() {
                    send_key(*key, true)?;
                    input.held_keys.lock().map_err(lock_error)?.remove(&key.0);
                }
            }
        }
        Ok(())
    }

    pub fn mouse(
        input: &NativeInput,
        x: i32,
        y: i32,
        button: &str,
        kind: &str,
        click_count: u32,
    ) -> AppResult<()> {
        unsafe {
            SetCursorPos(x, y)
                .map_err(|error| AppError::coded("INPUT_INJECTION_FAILED", error.to_string()))?;
        }
        if kind == "move" {
            return Ok(());
        }
        // Let the target receive the cursor move before the button event. Zero-duration
        // clicks are commonly discarded by emulator and protected input controls.
        std::thread::sleep(std::time::Duration::from_millis(22));
        let (down, up) = mouse_flags(button)?;
        match kind {
            "down" => {
                send_mouse(down)?;
                input
                    .held_buttons
                    .lock()
                    .map_err(lock_error)?
                    .insert(button.into());
            }
            "up" => {
                send_mouse(up)?;
                input
                    .held_buttons
                    .lock()
                    .map_err(lock_error)?
                    .remove(button);
            }
            _ => {
                let total = click_count.max(1);
                for index in 0..total {
                    send_mouse(down)?;
                    std::thread::sleep(std::time::Duration::from_millis(36));
                    send_mouse(up)?;
                    if index + 1 < total {
                        std::thread::sleep(std::time::Duration::from_millis(72));
                    }
                }
            }
        }
        Ok(())
    }

    pub fn scroll(x: i32, y: i32, delta: i32) -> AppResult<()> {
        unsafe {
            SetCursorPos(x, y)
                .map_err(|error| AppError::coded("INPUT_INJECTION_FAILED", error.to_string()))?;
        }
        std::thread::sleep(std::time::Duration::from_millis(18));
        send_mouse_data(MOUSEEVENTF_WHEEL, delta as u32)
    }

    pub fn text(input: &NativeInput, text: &str, clear_first: bool, method: &str) -> AppResult<()> {
        if clear_first {
            keyboard(input, "Ctrl+A", "press")?;
        }
        // Clipboard paste is not exposed by many Android emulators. Automatically
        // fall back to physical keystrokes there so existing workflows keep working.
        if method == "clipboard" && !foreground_is_emulator() {
            set_clipboard_string(text).map_err(|error| {
                AppError::coded(
                    "CLIPBOARD_UNAVAILABLE",
                    format!("Could not set clipboard text: {error}"),
                )
            })?;
            return keyboard(input, "Ctrl+V", "press");
        }
        if method == "keystroke" || foreground_is_emulator() {
            return type_with_physical_keys(text);
        }
        for unit in text.encode_utf16() {
            send_unicode(unit, false)?;
            std::thread::sleep(std::time::Duration::from_millis(2));
            send_unicode(unit, true)?;
        }
        Ok(())
    }

    pub fn release_all(input: &NativeInput) {
        if let Ok(mut keys) = input.held_keys.lock() {
            for key in keys.drain() {
                let _ = send_key(VIRTUAL_KEY(key), true);
            }
        }
        if let Ok(mut buttons) = input.held_buttons.lock() {
            for button in buttons.drain() {
                if let Ok((_, up)) = mouse_flags(&button) {
                    let _ = send_mouse(up);
                }
            }
        }
        for key in [VK_CONTROL, VK_SHIFT, VK_MENU] {
            let _ = send_key(key, true);
        }
    }

    pub fn cursor_position() -> AppResult<(i32, i32)> {
        let mut point = POINT::default();
        unsafe {
            GetCursorPos(&mut point)
                .map_err(|error| AppError::coded("CAPTURE_FAILED", error.to_string()))?;
        }
        Ok((point.x, point.y))
    }

    pub fn capture_click_points(count: usize) -> AppResult<Vec<(i32, i32)>> {
        if count == 0 {
            return Ok(Vec::new());
        }
        while key_pressed(VK_LBUTTON) {
            std::thread::sleep(std::time::Duration::from_millis(12));
        }
        let mut points = Vec::with_capacity(count);
        while points.len() < count {
            if key_pressed(VK_ESCAPE) {
                return Err(AppError::coded(
                    "CAPTURE_CANCELLED",
                    "Screen capture was cancelled.",
                ));
            }
            if key_pressed(VK_LBUTTON) {
                points.push(cursor_position()?);
                while key_pressed(VK_LBUTTON) {
                    std::thread::sleep(std::time::Duration::from_millis(12));
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
        Ok(points)
    }

    fn key_pressed(key: VIRTUAL_KEY) -> bool {
        unsafe { GetAsyncKeyState(key.0 as i32) < 0 }
    }

    pub fn pixel(x: i32, y: i32) -> AppResult<[u8; 3]> {
        unsafe {
            let dc = GetDC(None);
            if dc.is_invalid() {
                return Err(AppError::coded(
                    "CAPTURE_FAILED",
                    "Could not access the desktop display.",
                ));
            }
            let color = GetPixel(dc, x, y);
            let _ = ReleaseDC(None, dc);
            if color.0 == CLR_INVALID {
                return Err(AppError::coded(
                    "CAPTURE_FAILED",
                    "The pixel coordinate is outside the desktop.",
                ));
            }
            Ok([
                (color.0 & 0xff) as u8,
                ((color.0 >> 8) & 0xff) as u8,
                ((color.0 >> 16) & 0xff) as u8,
            ])
        }
    }

    struct WindowSearch<'a> {
        title: &'a str,
        mode: &'a str,
        process: &'a str,
        found: Option<HWND>,
    }

    fn window_process_name(hwnd: HWND) -> Option<String> {
        let mut process_id = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        }
        if process_id == 0 {
            return None;
        }
        let handle =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()? };
        let mut buffer = vec![0u16; 32_768];
        let mut length = buffer.len() as u32;
        let result = unsafe {
            QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        };
        unsafe {
            let _ = CloseHandle(handle);
        }
        result.ok()?;
        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        Some(
            path.rsplit(['\\', '/'])
                .next()
                .unwrap_or(path.as_str())
                .to_owned(),
        )
    }

    fn process_matches(actual: &str, expected: &str) -> bool {
        let actual = actual.trim().to_lowercase();
        let expected = expected.trim().to_lowercase();
        actual == expected
            || actual.strip_suffix(".exe") == Some(expected.as_str())
            || expected.strip_suffix(".exe") == Some(actual.as_str())
    }

    fn foreground_is_emulator() -> bool {
        let foreground = unsafe { GetForegroundWindow() };
        if foreground.0.is_null() {
            return false;
        }
        window_process_name(foreground).is_some_and(|name| is_emulator_process(&name))
    }

    fn is_emulator_process(name: &str) -> bool {
        let name = name.to_ascii_lowercase();
        [
            "mumu",
            "memu",
            "nox",
            "dnplayer",
            "ldplayer",
            "hd-player",
            "bluestacks",
            "androidemulator",
        ]
        .iter()
        .any(|candidate| name.contains(candidate))
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, data: LPARAM) -> BOOL {
        let search = &mut *(data.0 as *mut WindowSearch<'_>);
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }
        let length = GetWindowTextLengthW(hwnd);
        let actual_title = if length == 0 {
            String::new()
        } else {
            let mut buffer = vec![0u16; length as usize + 1];
            let written = GetWindowTextW(hwnd, &mut buffer);
            String::from_utf16_lossy(&buffer[..written as usize])
        };
        let title_matched = search.title.trim().is_empty()
            || match search.mode {
                "exact" => actual_title.eq_ignore_ascii_case(search.title),
                "regex" => {
                    Regex::new(search.title).is_ok_and(|regex| regex.is_match(&actual_title))
                }
                _ => actual_title
                    .to_lowercase()
                    .contains(&search.title.to_lowercase()),
            };
        let process_matched = search.process.trim().is_empty()
            || window_process_name(hwnd)
                .is_some_and(|actual| process_matches(&actual, search.process));
        let matched = title_matched && process_matched;
        if matched {
            search.found = Some(hwnd);
            BOOL(0)
        } else {
            BOOL(1)
        }
    }
    fn find_window(title: &str, mode: &str, process: &str) -> AppResult<Option<HWND>> {
        if title.trim().is_empty() && process.trim().is_empty() {
            return Ok(None);
        }
        let mut search = WindowSearch {
            title,
            mode,
            process,
            found: None,
        };
        unsafe {
            let _ = EnumWindows(
                Some(enum_callback),
                LPARAM((&mut search as *mut WindowSearch<'_>) as isize),
            );
        }
        Ok(search.found)
    }
    pub fn window_matches(
        title: &str,
        mode: &str,
        process: &str,
        active_only: bool,
    ) -> AppResult<bool> {
        let found = find_window(title, mode, process)?;
        Ok(found.is_some_and(|window| !active_only || unsafe { GetForegroundWindow() } == window))
    }
    pub fn window_action(title: &str, mode: &str, process: &str, operation: &str) -> AppResult<()> {
        let window = find_window(title, mode, process)?.ok_or_else(|| {
            AppError::coded(
                "TARGET_WINDOW_NOT_FOUND",
                format!("No window matched title '{title}' and process '{process}'."),
            )
        })?;
        unsafe {
            match operation {
                "minimize" => {
                    let _ = ShowWindow(window, SW_MINIMIZE);
                }
                "restore" => {
                    let _ = ShowWindow(window, SW_RESTORE);
                }
                "activate" => {
                    let _ = ShowWindow(window, SW_RESTORE);
                    if !SetForegroundWindow(window).as_bool() {
                        return Err(AppError::coded("PRIVILEGE_MISMATCH_OR_UIPI", "Windows did not allow the target to become active; it may be elevated."));
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    pub fn resolve_coordinate(x: i32, y: i32, space: &str, title: &str) -> AppResult<(i32, i32)> {
        match space {
            "window_client" => {
                let window = find_window(title, "contains", "")?.ok_or_else(|| {
                    AppError::coded(
                        "TARGET_WINDOW_NOT_FOUND",
                        format!("No window title contains '{title}'."),
                    )
                })?;
                let mut point = POINT { x, y };
                unsafe {
                    if !ClientToScreen(window, &mut point).as_bool() {
                        return Err(AppError::coded(
                            "COORDINATE_TRANSFORM_FAILED",
                            "Windows could not translate the client coordinate.",
                        ));
                    }
                }
                Ok((point.x, point.y))
            }
            "window_frame" => {
                let window = find_window(title, "contains", "")?.ok_or_else(|| {
                    AppError::coded(
                        "TARGET_WINDOW_NOT_FOUND",
                        format!("No window title contains '{title}'."),
                    )
                })?;
                let mut rect = windows::Win32::Foundation::RECT::default();
                unsafe {
                    GetWindowRect(window, &mut rect).map_err(|error| {
                        AppError::coded("COORDINATE_TRANSFORM_FAILED", error.to_string())
                    })?;
                }
                Ok((rect.left + x, rect.top + y))
            }
            _ => Ok((x, y)),
        }
    }

    fn parse_chord(keys: &str) -> AppResult<Vec<VIRTUAL_KEY>> {
        let mut output = Vec::new();
        for part in keys
            .split('+')
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            output.push(key_code(part).ok_or_else(|| AppError::coded("INVALID_KEY", format!("Unknown key '{part}'. Use names such as Ctrl, Alt, Shift, Enter, F1-F24, or a letter.")))?);
        }
        if output.is_empty() {
            return Err(AppError::coded("INVALID_KEY", "Keystroke cannot be empty."));
        }
        Ok(output)
    }
    fn key_code(name: &str) -> Option<VIRTUAL_KEY> {
        let upper = name.to_ascii_uppercase();
        let named = match upper.as_str() {
            "CTRL" | "CONTROL" => Some(VK_CONTROL),
            "ALT" => Some(VK_MENU),
            "SHIFT" => Some(VK_SHIFT),
            "WIN" | "WINDOWS" | "META" => Some(VK_LWIN),
            "ENTER" | "RETURN" => Some(VK_RETURN),
            "TAB" => Some(VK_TAB),
            "ESC" | "ESCAPE" => Some(VK_ESCAPE),
            "SPACE" => Some(VK_SPACE),
            "BACKSPACE" | "BACK" => Some(VK_BACK),
            "DELETE" | "DEL" => Some(VK_DELETE),
            "INSERT" | "INS" => Some(VK_INSERT),
            "HOME" => Some(VK_HOME),
            "END" => Some(VK_END),
            "PAGEUP" | "PGUP" => Some(VK_PRIOR),
            "PAGEDOWN" | "PGDN" => Some(VK_NEXT),
            "LEFT" => Some(VK_LEFT),
            "RIGHT" => Some(VK_RIGHT),
            "UP" => Some(VK_UP),
            "DOWN" => Some(VK_DOWN),
            "CAPSLOCK" => Some(VK_CAPITAL),
            "NUMLOCK" => Some(VK_NUMLOCK),
            "SCROLLLOCK" => Some(VK_SCROLL),
            "PRINTSCREEN" | "PRTSC" => Some(VK_SNAPSHOT),
            "PAUSE" | "BREAK" => Some(VK_PAUSE),
            "CONTEXTMENU" | "MENU" => Some(VK_APPS),
            "ADD" => Some(VK_ADD),
            "SUBTRACT" => Some(VK_SUBTRACT),
            "MULTIPLY" => Some(VK_MULTIPLY),
            "DIVIDE" => Some(VK_DIVIDE),
            "DECIMAL" => Some(VK_DECIMAL),
            "VOLUMEMUTE" => Some(VK_VOLUME_MUTE),
            "VOLUMEDOWN" => Some(VK_VOLUME_DOWN),
            "VOLUMEUP" => Some(VK_VOLUME_UP),
            "MEDIAPREVIOUS" => Some(VK_MEDIA_PREV_TRACK),
            "MEDIANEXT" => Some(VK_MEDIA_NEXT_TRACK),
            "MEDIASTOP" => Some(VK_MEDIA_STOP),
            "MEDIAPLAYPAUSE" => Some(VK_MEDIA_PLAY_PAUSE),
            _ => None,
        };
        if named.is_some() {
            return named;
        }
        if let Some(number) = upper
            .strip_prefix('F')
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|value| (1..=24).contains(value))
        {
            return Some(VIRTUAL_KEY(VK_F1.0 + number - 1));
        }
        if let Some(number) = upper
            .strip_prefix("NUMPAD")
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|value| *value <= 9)
        {
            return Some(VIRTUAL_KEY(VK_NUMPAD0.0 + number));
        }
        let mut chars = name.encode_utf16();
        let character = chars.next()?;
        if chars.next().is_some() {
            return None;
        }
        let code = unsafe { VkKeyScanW(character) };
        (code != -1).then_some(VIRTUAL_KEY((code as u16) & 0xff))
    }
    fn send_key(key: VIRTUAL_KEY, up: bool) -> AppResult<()> {
        // Scan-code input behaves like a physical keyboard and is accepted by more
        // DirectInput/emulator controls than virtual-key-only input.
        let mapped = unsafe { MapVirtualKeyW(key.0 as u32, MAPVK_VK_TO_VSC_EX) };
        let scan_code = (mapped & 0xff) as u16;
        let mut flags = if scan_code == 0 {
            KEYBD_EVENT_FLAGS(0)
        } else {
            KEYEVENTF_SCANCODE
        };
        if mapped & 0xff00 != 0 {
            flags |= KEYEVENTF_EXTENDEDKEY;
        }
        if up {
            flags |= KEYEVENTF_KEYUP;
        }
        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: if scan_code == 0 { key } else { VIRTUAL_KEY(0) },
                    wScan: scan_code,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        send(&[input])
    }

    fn type_with_physical_keys(text: &str) -> AppResult<()> {
        let mut characters = text.encode_utf16().peekable();
        while let Some(character) = characters.next() {
            match character {
                13 => {
                    if characters.peek() == Some(&10) {
                        characters.next();
                    }
                    press_physical_key(VK_RETURN, &[])?;
                }
                10 => press_physical_key(VK_RETURN, &[])?,
                9 => press_physical_key(VK_TAB, &[])?,
                8 => press_physical_key(VK_BACK, &[])?,
                _ => {
                    let mapped = unsafe { VkKeyScanW(character) };
                    if mapped == -1 {
                        send_unicode(character, false)?;
                        std::thread::sleep(std::time::Duration::from_millis(8));
                        send_unicode(character, true)?;
                    } else {
                        let modifiers = ((mapped as u16) >> 8) & 0xff;
                        let mut held = Vec::with_capacity(3);
                        if modifiers & 1 != 0 {
                            held.push(VK_SHIFT);
                        }
                        if modifiers & 2 != 0 {
                            held.push(VK_CONTROL);
                        }
                        if modifiers & 4 != 0 {
                            held.push(VK_MENU);
                        }
                        press_physical_key(VIRTUAL_KEY((mapped as u16) & 0xff), &held)?;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(8));
        }
        Ok(())
    }

    fn press_physical_key(key: VIRTUAL_KEY, modifiers: &[VIRTUAL_KEY]) -> AppResult<()> {
        for modifier in modifiers {
            send_key(*modifier, false)?;
        }
        send_key(key, false)?;
        std::thread::sleep(std::time::Duration::from_millis(18));
        send_key(key, true)?;
        for modifier in modifiers.iter().rev() {
            send_key(*modifier, true)?;
        }
        Ok(())
    }
    fn send_unicode(unit: u16, up: bool) -> AppResult<()> {
        let flags = if up {
            KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
        } else {
            KEYEVENTF_UNICODE
        };
        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(0),
                    wScan: unit,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        send(&[input])
    }
    fn mouse_flags(button: &str) -> AppResult<(MOUSE_EVENT_FLAGS, MOUSE_EVENT_FLAGS)> {
        match button {
            "left" => Ok((MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP)),
            "middle" => Ok((MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP)),
            "right" => Ok((MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP)),
            _ => Err(AppError::coded(
                "INVALID_MOUSE_BUTTON",
                format!("Unknown mouse button '{button}'."),
            )),
        }
    }
    fn send_mouse(flags: MOUSE_EVENT_FLAGS) -> AppResult<()> {
        send_mouse_data(flags, 0)
    }
    fn send_mouse_data(flags: MOUSE_EVENT_FLAGS, mouse_data: u32) -> AppResult<()> {
        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: mouse_data,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        send(&[input])
    }
    fn send(inputs: &[INPUT]) -> AppResult<()> {
        let sent = unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32) };
        if sent as usize != inputs.len() {
            Err(AppError::coded(
                "INPUT_INJECTION_FAILED",
                "Windows rejected synthesized input. The target may be running as administrator.",
            ))
        } else {
            Ok(())
        }
    }
    fn lock_error<T>(_: std::sync::PoisonError<T>) -> AppError {
        AppError::coded("RUNTIME_STATE_ERROR", "Input state lock was poisoned.")
    }

    #[cfg(test)]
    mod tests {
        use super::{is_emulator_process, key_code, process_matches};
        use windows::Win32::UI::Input::KeyboardAndMouse::{
            VIRTUAL_KEY, VK_BACK, VK_CAPITAL, VK_LWIN, VK_MEDIA_PLAY_PAUSE, VK_NUMPAD0,
        };

        #[test]
        fn process_names_match_with_or_without_exe_suffix() {
            assert!(process_matches("Notepad.EXE", "notepad"));
            assert!(process_matches("notepad", "NOTEPAD.exe"));
            assert!(!process_matches("notepad.exe", "calc.exe"));
        }

        #[test]
        fn extended_picker_keys_map_to_native_virtual_keys() {
            assert_eq!(key_code("Win"), Some(VK_LWIN));
            assert_eq!(key_code("CapsLock"), Some(VK_CAPITAL));
            assert_eq!(key_code("Numpad7"), Some(VIRTUAL_KEY(VK_NUMPAD0.0 + 7)));
            assert_eq!(key_code("MediaPlayPause"), Some(VK_MEDIA_PLAY_PAUSE));
            assert_eq!(key_code("Backspace"), Some(VK_BACK));
        }

        #[test]
        fn common_android_emulators_are_detected_by_process_name() {
            assert!(is_emulator_process("MuMuNxMain.exe"));
            assert!(is_emulator_process("MEmu.exe"));
            assert!(is_emulator_process("HD-Player.exe"));
            assert!(!is_emulator_process("notepad.exe"));
        }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::*;
    fn unsupported() -> AppError {
        AppError::coded(
            "PLATFORM_UNSUPPORTED",
            "Native automation is supported on Windows 10/11 x64.",
        )
    }
    pub fn keyboard(_: &NativeInput, _: &str, _: &str) -> AppResult<()> {
        Err(unsupported())
    }
    pub fn mouse(_: &NativeInput, _: i32, _: i32, _: &str, _: &str, _: u32) -> AppResult<()> {
        Err(unsupported())
    }
    pub fn scroll(_: i32, _: i32, _: i32) -> AppResult<()> {
        Err(unsupported())
    }
    pub fn text(_: &NativeInput, _: &str, _: bool, _: &str) -> AppResult<()> {
        Err(unsupported())
    }
    pub fn release_all(_: &NativeInput) {}
    pub fn cursor_position() -> AppResult<(i32, i32)> {
        Err(unsupported())
    }
    pub fn capture_click_points(_: usize) -> AppResult<Vec<(i32, i32)>> {
        Err(unsupported())
    }
    pub fn pixel(_: i32, _: i32) -> AppResult<[u8; 3]> {
        Err(unsupported())
    }
    pub fn window_matches(_: &str, _: &str, _: &str, _: bool) -> AppResult<bool> {
        Err(unsupported())
    }
    pub fn window_action(_: &str, _: &str, _: &str, _: &str) -> AppResult<()> {
        Err(unsupported())
    }
    pub fn resolve_coordinate(_: i32, _: i32, _: &str, _: &str) -> AppResult<(i32, i32)> {
        Err(unsupported())
    }
}
