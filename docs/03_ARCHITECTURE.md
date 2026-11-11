# 03 — Architecture Decision Record

## ADR-001 Chosen architecture

### Decision

Use:

- **Tauri 2**
- **React + TypeScript**
- **Rust native core**
- **Optional Python sidecar for CV/OCR**
- Windows-first native APIs
- JSON/ZIP project container
- event-driven IPC between runtime and UI

### Why not Tauri + TypeScript + Python-only engine?

A Python-only automation engine is easy to prototype, but it has disadvantages for this product:

- larger packaged runtime
- more memory at idle/run
- more startup overhead
- native Windows input/hotkey/window operations still need native bindings
- harder emergency-stop guarantees if everything is in a Python worker
- more fragile packaging for antivirus-sensitive utilities

### Why Rust owns the runtime

Rust/Tauri core should own:

- workflow scheduler
- state machine
- keyboard/mouse injection
- global hotkeys
- window discovery
- cancellation
- timing
- project file IO
- logging
- screen capture dispatch
- sidecar lifecycle

This makes normal macros work without Python.

### Why keep Python at all?

Python is excellent for:
- OpenCV template matching
- optional OCR engines
- experimentation with image-processing algorithms

Tauri supports embedded external binaries/sidecars, including Python tools packaged into executables. The sidecar should be lazy-started and killed on app exit.

## ADR-002 Frontend framework

Use React + TypeScript.

Reasons:
- predictable component model
- mature table/dialog ecosystem
- good state tooling
- Codex is likely to generate maintainable TS/React reliably

Do not use a huge UI framework that imposes Material/modern styling.

Preferred:
- hand-authored CSS
- small primitive components
- native-looking custom classic theme

## ADR-003 State separation

Three distinct states:

### Editor state
The workflow currently being edited.

### Runtime snapshot
Immutable validated plan generated when Start is pressed.

### Runtime state
Current run:
- action pointer
- variables
- loop stack
- call/jump state
- status
- cancellation token
- log

Editing while running:
- default V1 behavior: editing disabled while run is active
- future: allow edits but only apply next run

## ADR-004 IPC

Frontend -> Rust:
- Tauri commands for editor/project operations
- start/pause/resume/stop
- capture target
- test condition

Rust -> Frontend:
- structured events
- run-state changes
- action-state updates
- diagnostics
- logs

Rust <-> Python:
- JSON Lines over stdin/stdout
- no localhost HTTP server
- one request ID per command
- heartbeats optional
- bounded payloads
- image data should use temporary file paths or binary resource path, not giant base64 blobs in repeated messages

## ADR-005 Threading/runtime

- UI thread: rendering only
- Rust async runtime: orchestration
- dedicated worker/blocking thread for Windows capture/input calls when necessary
- Python worker: CV/OCR only

No `sleep()` on UI thread.

## ADR-006 Project format

Use `.akx` as a ZIP container:

- `manifest.json`
- `workflow.json`
- `assets/images/...`
- `assets/ocr/...` if needed
- optional `metadata.json`

Benefits:
- portable one-file workflows
- image templates travel with workflow
- schema versioning
- easy backup/inspection

Also allow plain `.akx.json` in dev/test.

## ADR-007 Legacy .aki

Do not make successful `.aki` import a V1 blocker.

The provided `.aki` file is a binary legacy format and confirms existing concepts such as:
- AutoKeyboard V9.0 marker
- mouse actions
- keystrokes
- text
- variables
- delay
- generate
- repeat/action sequences

V1 priority:
- reproduce behavior and UX

Phase 2 optional:
- build a read-only `.aki` importer after reverse engineering enough samples
- never overwrite original `.aki`
- importer should produce `.akx`

## ADR-008 Data store

Do not introduce a database for core project files.

Use:
- `.akx` for project
- Tauri store/settings for preferences
- lightweight SQLite only if run history/search later requires it

## ADR-009 Security model

- Tauri command surface must be explicit
- sidecar permissions minimal
- no arbitrary shell execution from workflow
- no arbitrary script execution in V1
- imported workflows treated as untrusted data
- validate file paths and assets

## ADR-010 Windows integrity limitation

Input injection can be blocked by Windows integrity/UIPI when target applications run at a higher privilege level.

Product behavior:
- detect likely privilege mismatch where possible
- show clear error
- do not silently retry forever
- never auto-elevate without user action
