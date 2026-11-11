# AutoKeyboard Advanced

AutoKeyboard Advanced is a Windows desktop app for building and running repeatable keyboard and mouse workflows. It keeps a simple action table while adding conditional waits, variables, branching, loops, window checks, and optional image matching.

## What it can do

- Build workflows from keystroke, mouse, text, variable, and wait actions.
- Record keyboard and mouse input, then review and edit the captured actions.
- Wait for pixels, windows, or images before continuing instead of relying only on fixed delays.
- Use variables, `IF / ELSE`, loops, retries, and failure handling to control a workflow.
- Save portable `.akx` projects, including image assets, or readable `.akx.json` files.
- Pause, resume, stop, and inspect live run status and logs.

Image matching is handled by an optional Python vision worker, started only when an image action needs it. Normal keyboard and mouse playback runs in the Rust native engine. OCR is not included in version 1.0.

## Run from source

Requirements: Windows 10/11, Node.js 20+, Rust stable with the MSVC toolchain, and Microsoft Edge WebView2 Runtime. Python 3.11+ is needed only to rebuild or test the vision worker.

```powershell
npm install
npm run vision:build
npm run tauri dev
```

To build a Windows installer:

```powershell
npm run tauri build
```

Installers are written under `src-tauri/target/release/bundle`. See [docs/BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md) for release packaging details.

## How a workflow runs

1. Add and configure actions in the editor table. Each action can have its own repeat count and delay; **Repeat Times** repeats the whole workflow.
2. Use **Wait Until** and conditions when the next step should depend on what is on screen or which window is open.
3. Press **Start**. The app validates the workflow, snapshots it for the run, and the Rust engine executes it while sending status and log events to the UI.
4. Pause or resume the run as needed. **Stop** and the emergency shortcut cancel waits and release held input.

Read the [user guide](docs/USER_GUIDE.md) for action setup and examples, the [architecture overview](docs/03_ARCHITECTURE.md) for the app internals, and the [sample workflows](docs/15_SAMPLE_WORKFLOWS.md) for patterns.

## Safety controls

- `Ctrl+Alt+F5`: global start
- `Ctrl+Alt+F6`: global pause/resume
- `Ctrl+Alt+Shift+F12`: emergency stop and release held inputs
- `Esc`: stop recording

Workflows can control desktop input, so review recorded or imported actions before running them against important applications. Input sent to an elevated Windows app may be blocked by Windows permissions.

## Project status

This is a Windows-first desktop application. See [docs/11_ROADMAP_AND_GATES.md](docs/11_ROADMAP_AND_GATES.md) for planned work and [docs/13_RISKS_AND_NON_GOALS.md](docs/13_RISKS_AND_NON_GOALS.md) for limitations and scope.
