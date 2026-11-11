# AutoKeyboard Advanced — Codex Handoff Pack

## Mission

Build a Windows-first desktop automation application that deliberately preserves the **simple, classic Auto-Keyboard interaction model** visible in the supplied reference screenshots, while replacing its fixed-delay-only execution model with a much more capable **condition-driven workflow engine**.

The product should feel immediately familiar to a user of the reference app:

- classic menu bar
- classic toolbar
- single central action table
- modal editors for actions
- Repeat Times at the bottom
- New / Open / Save / Keystroke / Mouse / Variable / Text / Up / Down / Delete / Start
- direct, low-friction workflow building

But the engine must support modern automation primitives such as:

- wait until image appears/disappears
- wait until pixel/color matches/changes
- wait until target window exists/is active
- if / else
- loop until
- timeout
- retry
- variables
- expression conditions
- action failure policy
- stop/pause
- global hotkeys
- screen-region capture
- optional OCR text detection
- optional image-template matching
- deterministic logs and run history

## Architecture decision

**Recommended:**

- Tauri 2 desktop shell
- React + TypeScript frontend
- Rust native automation/runtime core
- Optional Python vision/OCR sidecar, packaged as an embedded executable
- JSON-based project model
- Windows-first APIs for input injection, window inspection, capture, and hotkeys

Python must **not** own basic keyboard/mouse playback. It is an optional worker for computer-vision/OCR tasks. This keeps normal execution light and avoids paying Python startup/RAM cost for every macro.

## Product philosophy

1. **Simple on the surface. Powerful underneath.**
2. The main editor stays table-based rather than becoming a giant node graph.
3. Advanced actions are exposed as additional action types and compact dialogs.
4. Every automation has deterministic stop/pause/error behavior.
5. Never make the user guess whether the engine is waiting, running, paused, retrying, or failed.
6. Preserve the visual proportions and ordering shown in the reference screenshots unless this documentation explicitly changes something.
7. Do not copy proprietary code or embedded binary resources from the reference application. Reproduce behavior/layout using original implementation and appropriately licensed icons/assets.

## Scope boundary

This is a general-purpose desktop UI automation, QA, repetitive-task and test-flow tool. Do not add modules whose purpose is to manipulate ad impressions/reward systems, bypass anti-fraud controls, evade service limits, or automate prohibited reward farming.

## How Codex should use this pack

Read in this order:

1. `README_FIRST.md`
2. `docs/01_PRODUCT_REQUIREMENTS.md`
3. `docs/02_REFERENCE_UI_SPEC.md`
4. `docs/03_ARCHITECTURE.md`
5. `docs/04_ACTION_ENGINE.md`
6. `docs/05_CONDITION_ENGINE.md`
7. `docs/06_PROJECT_FILE_FORMAT.md`
8. `docs/07_NATIVE_WINDOWS_ENGINE.md`
9. `docs/08_VISION_SIDECAR.md`
10. `docs/09_UI_IMPLEMENTATION.md`
11. `docs/10_TESTING_AND_QA.md`
12. `docs/11_ROADMAP_AND_GATES.md`
13. `docs/12_RELEASE_AND_PACKAGING.md`
14. `docs/13_RISKS_AND_NON_GOALS.md`
15. `CODEX_MASTER_PROMPT.md`

The `reference/` folder contains the user-provided UI screenshots and sample legacy `.aki` workflow used for behavioral understanding.
