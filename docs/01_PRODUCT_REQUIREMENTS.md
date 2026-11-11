# 01 — Product Requirements Specification

## 1. Product summary

AutoKeyboard Advanced is a Windows desktop macro builder and runtime.

It must preserve the simplicity of a classic action-list macro program while adding condition-aware automation.

The primary user interaction is:

1. Add an action.
2. Configure it in a small modal.
3. See it appear as a row.
4. Reorder rows with Up / Down.
5. Set Repeat Times.
6. Press Start.
7. Observe live state in the action list/status bar.
8. Stop or pause instantly at any time.

## 2. Compatibility target

The supplied reference app exposes at least these current concepts:

- Project: New, Open, Save
- Keystroke
- Mouse
- Variable
- Text
- Up
- Down
- Delete
- Start
- Delay in milliseconds
- Generate count
- Repeat Times
- Pixel Color column
- action row columns:
  - Index
  - Name
  - Details
  - Type
  - Delay
  - Generate
  - Pixel Color

The new product must implement equivalent core capabilities before advanced features are considered complete.

## 3. Core functional requirements

### FR-001 Project creation

- New clears the current workflow after dirty-state confirmation.
- Project starts with zero actions.
- Repeat Times defaults to 1.
- Dirty-state indicator is visible in title bar, e.g. `*`.

### FR-002 Project persistence

- Save and Save As.
- Open current project format.
- Auto-create backup before overwrite.
- Preserve all action IDs and assets.
- Never silently discard unknown future fields.

### FR-003 Action list

- Single sortable/reorderable list.
- Stable action IDs independent of row index.
- Selecting a row enables edit/reorder/delete.
- Double-click edits row.
- Keyboard shortcuts:
  - Delete = delete row
  - Ctrl+Up / Ctrl+Down = reorder
  - Ctrl+S = save
  - F5 or configured global key = start
  - configured emergency key = stop

### FR-004 Keystroke action

Must support:

- single keys
- modifiers
- combinations
- key down / key up
- repeat/generate count
- inter-key delay
- per-action post delay

### FR-005 Mouse action

Must support:

- left/middle/right
- single/double click
- mouse move
- mouse down/up
- absolute screen coordinates
- window-relative coordinates
- region-relative coordinates
- current cursor capture ("Get Coordinate")
- generate count
- per-action delay

### FR-006 Text action

Must support:

- clipboard paste
- simulated keystrokes
- Unicode text
- variable substitution
- optional clear-first
- generate count
- post delay

### FR-007 Variable action

Must support:

- integer
- string
- boolean
- decimal
- increment/decrement
- assignment
- min length / zero pad for numeric display
- base formatting if needed: binary/octal/decimal/hex
- interpolation syntax `${name}`

### FR-008 Fixed wait

- explicit wait action in milliseconds/seconds
- cancellable
- no blocking UI thread

### FR-009 Conditional wait

Wait until one of the following is true:

- image appears
- image disappears
- pixel/color matches
- pixel/color differs
- window exists
- window active
- text appears via optional OCR
- expression true

Every wait must have:

- poll interval
- timeout
- on-timeout behavior
- live elapsed time
- cancellation support

### FR-010 Branching

- IF condition
- ELSE
- END IF
- nested branching allowed
- validation must reject malformed blocks before running

### FR-011 Looping

- repeat N
- while condition
- until condition
- break
- continue
- maximum safety iteration cap configurable

### FR-012 Retry/error policy

Per action:

- fail workflow
- skip action
- retry N times
- jump to label
- continue with warning

### FR-013 Labels and jump

- Label action
- Jump action
- conditional jump
- validate missing/duplicate labels

### FR-014 Run controls

States:

- Idle
- Starting
- Running
- Waiting
- Paused
- Stopping
- Completed
- Failed
- Cancelled

Start button changes meaning/icon when running.

### FR-015 Pause/resume

Pause must:

- stop issuing new input
- suspend waits without losing elapsed timeout policy OR clearly define timeout behavior
- resume from same action

Default behavior: timeout clocks pause while workflow is paused.

### FR-016 Emergency stop

- global emergency stop hotkey
- defaults to a conflict-resistant combination
- must work even if app is not focused
- stop should be cooperative first, then hard-cancel worker tasks

### FR-017 Run log

Each event records:

- timestamp
- run ID
- action ID
- action index at time of run
- action name
- state
- result
- duration
- retry count
- error code/message

### FR-018 Screen target tools

User can capture:

- full screen
- monitor
- window
- rectangular region

Used for image/pixel/OCR conditions.

### FR-019 Multi-monitor

- coordinate system handles negative coordinates
- display DPI awareness
- monitor enumeration
- per-monitor scaling correctness

### FR-020 Window target

Target by:

- title contains/exact/regex
- executable/process name
- optional class
- optional stored HWND resolved fresh at runtime

Never persist raw HWND as the only durable target.

## 4. Advanced requirements

### AR-001 Image condition

- user captures or imports template
- similarity threshold
- region restriction
- grayscale option
- scaling tolerance optional
- return match center X/Y
- store match confidence into variable
- optionally click center if match found

### AR-002 Pixel condition

- capture pixel coordinate
- capture color
- tolerance
- RGB/HEX display
- optional neighborhood tolerance

### AR-003 OCR condition

- OCR is optional and must be clearly marked slower/heavier
- region-based
- contains/exact/regex
- language selection if engine supports it
- timeout and poll interval

### AR-004 Composite conditions

Support AND / OR / NOT over primitive conditions.

### AR-005 Randomization for ordinary QA flows

Optional:
- delay range
- choose one of several test paths

Do not implement features intended to evade anti-bot or anti-fraud systems.

## 5. Non-functional requirements

### Performance

Idle:
- frontend should not continuously capture screen
- no Python sidecar unless required
- low background CPU

Running normal click/key workflow:
- Rust runtime should own scheduling
- UI only receives events
- action timing drift should be bounded

### Reliability

- cancellation checked before and after every action
- no orphan sidecar on exit
- autosave recovery
- crash-safe run log

### UX

- beginner can build simple click/type workflow without reading documentation
- advanced condition setup never changes the simplicity of basic dialogs
- UI should look and behave like a classic Windows utility, not a flashy dashboard

### Platform

V1:
- Windows 10/11 x64

Later:
- possible ARM64 or other platforms only after Windows parity is complete.
