# 18 — Engine Events and Tauri API Contract

## Frontend commands

Suggested:

```text
project_new()
project_open(path?)
project_save(path?)
project_save_as(path)
project_validate(workflow)
run_start(workflowSnapshot)
run_pause()
run_resume()
run_stop()
capture_coordinate()
capture_pixel()
capture_region()
condition_test(condition)
window_list()
settings_get()
settings_set()
diagnostics_get()
```

## Rust -> frontend events

`run_state`

```json
{
  "runId": "...",
  "state": "waiting",
  "repeatIndex": 1,
  "actionId": "...",
  "actionIndex": 14,
  "message": "Waiting for image"
}
```

`action_state`

```json
{
  "runId": "...",
  "actionId": "...",
  "state": "running",
  "attempt": 1,
  "startedAt": "..."
}
```

`condition_sample`

Throttle UI updates to avoid spam:

```json
{
  "actionId": "...",
  "kind": "image_present",
  "elapsedMs": 1250,
  "confidence": 0.82,
  "matched": false
}
```

`run_log`

Structured log entry.

## Error codes

Examples:
- `VALIDATION_ERROR`
- `INPUT_INJECTION_FAILED`
- `TARGET_WINDOW_NOT_FOUND`
- `CONDITION_TIMEOUT`
- `ASSET_MISSING`
- `VISION_WORKER_UNAVAILABLE`
- `VISION_WORKER_TIMEOUT`
- `PROJECT_CORRUPT`
- `PROJECT_SCHEMA_UNSUPPORTED`
- `HOTKEY_REGISTRATION_FAILED`
- `RUN_CANCELLED`
- `PRIVILEGE_MISMATCH_OR_UIPI`

Frontend must map typed errors to human-readable messages.
