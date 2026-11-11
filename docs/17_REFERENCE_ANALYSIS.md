# 17 — Supplied Reference Analysis

## Screenshot observations

The supplied images show a classic Windows desktop utility titled `Auto-Keyboard`.

Observed main controls:
- File
- Edit
- Add
- Language
- Help
- New
- Open
- Save
- Keystroke
- Mouse
- Variable
- Text
- Up
- Down
- Delete
- Start

Observed action list columns:
- Index
- Name
- Details
- Type
- Delay
- Generate
- Pixel Color

Observed bottom input:
- Repeat Times

### Keystroke modal

Observed:
- Keystroke field
- picker button
- Delay (in milliseconds)
- Generate
- OK / Cancel

### Mouse modal

Observed:
- left/middle/right click
- double-click left/middle/right
- X coordinate
- Y coordinate
- Get Coordinate
- Delay
- Generate
- OK / Cancel

### Variable modal

Observed:
- Value
- Increment
- Min length
- Bin / Oct / Dec / Hex
- Delay
- Generate
- OK / Cancel

### Text modal

Observed:
- large text editor
- None state
- Read state
- Replace state
- Set controls
- Generate text via clipboard
- Generate text via character message
- Generate text via keystroke
- Word wrap
- Delay
- Generate
- OK / Cancel

### Populated workflow

The supplied populated screenshot shows real use with:
- mouse clicks
- double-clicks
- Ctrl+A
- Ctrl+C
- Ctrl+V
- Backspace
- text
- variables
- different per-row delays
- repeat count

This confirms that the action table and low-friction modal editing are central to the desired workflow.

## Legacy `.aki` sample

The provided binary sample contains an `AutoKeyboard V9.0` marker and readable UTF-16 action labels/fields consistent with the screenshots.

This pack does not claim a complete reverse-engineered binary schema. The file is used as a behavioral reference only.
