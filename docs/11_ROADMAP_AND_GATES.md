# 11 — Implementation Roadmap and Gates

Do not build everything in one giant pass.

## G0 — Repository/bootstrap

Deliver:
- Tauri 2 app boots
- React/TypeScript configured
- Rust commands callable
- lint/test scripts
- Windows CI/build notes
- classic empty shell window

Acceptance:
- clean build
- no sidecar yet
- no warnings that indicate broken setup

## G1 — Pixel-faithful reference UI

Deliver:
- menu
- toolbar in locked order
- action table
- repeat control
- all four reference dialogs:
  - Keystroke
  - Mouse
  - Variable
  - Text

They can initially save mock actions.

Acceptance:
- screenshot comparison
- resize/DPI basic pass

## G2 — Project/editor model

Deliver:
- action schema
- add/edit/delete/reorder
- undo/redo if included
- new/open/save
- `.akx.json` dev format
- dirty state

Acceptance:
- round-trip test
- 1,000 rows responsive

## G3 — Native keyboard/mouse runtime

Deliver:
- Rust scheduler
- input provider
- fixed delays
- generate
- Repeat Times
- Start/Stop
- global emergency stop
- runtime highlights/logs

Acceptance:
- reference-style scripts can be recreated manually and executed
- no Python dependency

## G4 — Variables/text

Deliver:
- variable store
- increment
- interpolation
- clipboard/text methods

Acceptance:
- deterministic tests

## G5 — Native conditions

Deliver:
- Wait
- PixelMatch/PixelChanged
- WindowExists/Active
- condition polling
- timeout
- failure policies

Acceptance:
- variable wait test proves action occurs as soon as condition becomes true, not a fixed guessed time

## G6 — Branching and loops

Deliver:
- IF/ELSE/ENDIF
- count/while/until loops
- label/jump if approved for V1
- compile/validation

Acceptance:
- nested-flow tests
- malformed flow blocked before run

## G7 — Image vision sidecar

Deliver:
- packaged Python worker
- lazy launch
- template matching
- capture/import image
- Wait Image
- Find Image and Click
- timeout/cancel

Acceptance:
- normal workflow still launches with no sidecar process
- image flow works
- sidecar dies with app

## G8 — OCR optional

Only if package/performance acceptable.

Deliver:
- region OCR
- text condition
- test dialog

If not acceptable:
- leave feature out of V1; architecture remains ready.

## G9 — Recorder

Deliver:
- optional record mode
- clicks/keys
- coordinate capture
- cleanup editor

Do not let recorder delay core condition engine release.

## G10 — Production hardening

Deliver:
- `.akx` ZIP format
- backup/autosave
- updater strategy
- code signing instructions
- crash logs
- installer
- release build

## Gate rule

At the end of every gate Codex must provide:

1. exact files changed
2. commands run
3. tests and results
4. screenshots for UI gates
5. known limitations
6. explicit statement that no later-gate feature was partially hacked in unless needed as a stub

Do not proceed to later gates while current gate has failing acceptance criteria.
