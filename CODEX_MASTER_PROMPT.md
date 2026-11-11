# CODEX MASTER PROMPT — BUILD AUTO-KEYBOARD ADVANCED

You are implementing a Windows-first desktop automation application from the specification in this repository.

## Read first

Read every file in this handoff pack before modifying code.

The supplied screenshots are the visual reference. The project goal is **not** a modern redesign. Preserve the classic Auto-Keyboard-style UI structure and compactness.

## Architecture is locked unless a blocker is proven

- Tauri 2
- React + TypeScript
- Rust native automation/runtime core
- Python sidecar only for image/OCR work
- Windows 10/11 x64 first

Do not move basic automation into Python.

## Product rule

The product must be usable as a simple fixed macro tool exactly in the reference spirit, while adding conditions.

The key improvement is:

**Fixed-delay legacy model**
`action -> delay -> action`

becomes:

**Advanced model**
`action -> observe condition -> wait/retry/branch -> next action`

## UI rule

Core toolbar order is locked:

New | Open | Save | Keystroke | Mouse | Variable | Text | Up | Down | Delete | Start

Keep:

- menu bar
- toolbar
- central action table
- bottom Repeat Times control
- classic compact modal dialogs

Do not replace this with:

- cards
- sidebar
- node editor
- modern dashboard

## Implementation rules

1. Work gate-by-gate using `docs/11_ROADMAP_AND_GATES.md`.
2. Do not skip gate acceptance criteria.
3. Before coding a gate, state the exact scope.
4. After coding:
   - list changed files
   - run formatter/lint/tests
   - provide results
   - provide UI screenshots where relevant
5. No giant one-file implementation.
6. Keep OS logic out of React.
7. Keep engine independently testable with fake providers.
8. All waits/capture/vision operations cancellable.
9. Emergency Stop is a correctness requirement, not an enhancement.
10. Never leave Ctrl/Alt/Shift or mouse button logically held after failure/stop.
11. Python sidecar must be lazy, supervised, and terminated on app exit.
12. Basic macro must run with no Python process.
13. Do not use arbitrary JS eval or arbitrary shell/script execution.
14. Treat imported project data as untrusted.
15. Do not add stealth, anti-detection, anti-fraud bypass, captcha solving, or ad/reward-farming modules.

## First task

Implement only G0.

G0 deliverables:

- initialize repo
- Tauri 2 + React/TS
- Rust backend command roundtrip
- clean classic main shell window
- test/lint/format scripts
- project structure prepared for engine modules
- no Python worker yet
- no fake advanced features presented as complete

Stop after G0 and report results.
