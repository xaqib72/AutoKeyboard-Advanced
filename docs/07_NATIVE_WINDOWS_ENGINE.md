# 07 — Native Windows Automation Core

## 1. Scope

Rust layer provides native Windows behavior.

Suggested crates/dependencies should be chosen conservatively. Prefer direct Windows bindings through the maintained Windows crate ecosystem where practical.

## 2. Input injection

Use Windows-supported input synthesis APIs for:
- mouse
- keyboard

Requirements:
- key down/up pairs correct
- modifier ordering correct
- Unicode handling documented
- emergency cancellation between generated repetitions
- no stuck modifiers after cancellation/error

Implement cleanup:
- if runtime believes it left a key/button down, release it during stop/finally.

## 3. Input capture for recorder

Recorder is a later V1.x/Phase 2 feature unless capacity allows.

If implemented:
- low-level hooks only while recording
- visible recording indicator
- stop hotkey excluded from recorded stream
- coalesce high-frequency mouse movement
- user can choose:
  - clicks only
  - keys + clicks
  - mouse movement too

## 4. Global hotkeys

Use global shortcut mechanism for:
- Start
- Pause/Resume
- Emergency Stop

Collision detection:
- if registration fails, show settings warning
- never leave user without a stop path

## 5. Window discovery

Build `WindowTargetResolver`.

Inputs:
- process name
- title rule
- optional class

Outputs:
- matching windows
- chosen window
- rectangle
- DPI/scaling info
- foreground status

Window picker:
- crosshair/selector optional
- basic list picker sufficient for first implementation

## 6. Coordinates

Support enum:

```ts
type CoordinateSpace =
  | "virtual_screen"
  | "monitor"
  | "window_client"
  | "window_frame";
```

Persist relevant target metadata.

## 7. DPI awareness

The executable must be DPI aware.

Tests:
- 100/125/150%
- mixed DPI monitors
- negative X monitor arrangement

## 8. Screen capture

Provide Rust capture abstraction:

```text
CaptureSource
  - FullVirtualScreen
  - Monitor(id)
  - Window(target)
  - Region(globalRect)
```

Return normalized bitmap buffer or temp image file for CV worker.

Optimization:
- crop before sending to Python
- reuse capture buffers where safe
- throttle according to poll interval

## 9. Privilege boundaries

Windows may reject injected input into higher-integrity processes.

Behavior:
- return typed `PRIVILEGE_MISMATCH_OR_UIPI` error when suspected
- explain target may be elevated
- do not automatically relaunch elevated during a running workflow

## 10. Clipboard

Text via clipboard:
1. save clipboard only if restore option enabled
2. write text
3. paste
4. optional wait
5. restore best-effort

Be careful with:
- non-text clipboard
- huge data
- clipboard locking
- sensitive contents in logs (never log clipboard content by default)

## 11. Cancellation

Use one run cancellation token propagated to:
- wait timers
- image requests
- OCR requests
- input repetitions
- retry delay
- condition polling

Stop latency target:
- normal state: < 250ms
- during CV/OCR: worker command must support timeout/cancel; if unresponsive, sidecar can be restarted

## 12. Runtime isolation

Only one workflow run in V1.

Do not allow two macros to inject input concurrently.

Future multi-run must use explicit target isolation and arbitration.
