# 02 — Reference UI Reverse-Engineering Specification

## 1. Visual goal

Reproduce the supplied application's **classic compact Windows utility styling** as closely as practical:

- white/light-gray background
- classic menu bar at top
- classic toolbar directly below
- icon above or beside compact label depending on toolbar implementation
- thin separators between toolbar groups
- white action table
- minimal borders
- no modern oversized cards
- no gradients
- no glass
- no animation-heavy interface
- compact system-like dialogs
- conventional OK / Cancel buttons

Do not "modernize" the visual language unless specifically approved.

## 2. Main window layout

Approximate vertical structure:

1. OS title bar
2. menu bar
3. toolbar
4. action grid/table
5. bottom repeat/status strip

### Menu bar

Visible reference menus:
- File
- Edit
- Add
- Language
- Help

Expected menus:

#### File
- New
- Open
- Save
- Save As
- Recent Files
- Exit

#### Edit
- Edit Selected
- Cut
- Copy
- Paste
- Duplicate
- Delete
- Move Up
- Move Down
- Select All

#### Add
- Keystroke
- Mouse
- Variable
- Text
- Wait
- Condition
- If
- Else
- End If
- Loop
- Label
- Jump
- Window
- Comment

#### Language
- English in V1
- architecture should support future translations

#### Help
- User Guide
- Keyboard Shortcuts
- Diagnostics
- About

## 3. Toolbar order

The reference toolbar order is a locked compatibility requirement for the first core buttons:

1. New
2. Open
3. Save
4. separator
5. Keystroke
6. Mouse
7. Variable
8. Text
9. separator
10. Up
11. Down
12. Delete
13. separator
14. Start

Advanced actions must be added without destroying this order.

Recommended solution:
- keep reference row intact
- add a second compact "Advanced" toolbar OR an Add dropdown next to Text
- do not push Start off-screen at common sizes

## 4. Action table columns

Compatibility columns first:

- Index
- Name
- Details
- Type
- Delay
- Generate
- Pixel Color

New optional columns after these:
- Condition
- Timeout
- Status

Default view should stay close to reference. Advanced columns can be hidden/showable.

### Row behavior

- single row selection
- multi-select can be added for delete/move as long as single-select behavior stays familiar
- current running row highlighted
- waiting row has visible status
- failed row shows error indicator
- completed row may show temporary state only; do not permanently recolor the whole workflow

## 5. Bottom bar

Left side:
- `Repeat Times:` numeric control

Right side additions allowed:
- runtime state
- elapsed time
- current action
- Start/Pause/Stop indicators

Keep height compact.

## 6. Keystroke dialog

Reference fields:
- Keystroke
- Delay (in milliseconds)
- Generate
- OK
- Cancel

V1-compatible dialog should preserve these exact primary fields.

Advanced section may be collapsed:

- mode: press / down / up
- pre-delay
- post-delay
- retry policy
- optional condition guard

## 7. Mouse dialog

Reference controls:
- click left button
- click middle button
- click right button
- double-click left button
- double-click middle button
- double-click right button
- X-Coordinate
- Y-Coordinate
- Get Coordinate
- Delay
- Generate
- OK
- Cancel

Preserve these as the default visible controls.

Advanced collapsed area:
- coordinate space
- monitor/window target
- move-before-click
- button down/up
- cursor restore
- condition guard

## 8. Variable dialog

Reference fields:
- Value
- Increment
- Min length
- Bin / Oct / Dec / Hex
- Delay
- Generate
- OK
- Cancel

Preserve equivalent compatibility mode.

New engine may internally represent variables by names. For reference-style simple variable actions, provide a default variable slot or auto-name such as `var1`.

## 9. Text dialog

Reference contains:
- large text area
- None state
- Read state
- Replace state
- Generate text via clipboard
- Generate text via character message
- Generate text via keystroke
- Word wrap
- Delay
- Generate
- OK
- Cancel

V1 should reproduce this layout conceptually.

If an option is platform-specific or unreliable, keep UI disabled with explanation until implemented rather than silently emulating differently.

## 10. Advanced condition dialog

Must still look like a classic compact dialog.

Fields:
- Condition type
- Target/capture
- operator
- expected value/template
- poll every
- timeout
- On timeout
- Save result to variable
- Test Condition
- OK
- Cancel

### Image condition subview
- thumbnail
- Capture Region
- Import Image
- similarity
- region
- Test

### Pixel subview
- X
- Y
- captured color swatch
- RGB/HEX
- tolerance
- Get Pixel

### Window subview
- process
- title rule
- picker
- active/exists state

## 11. DPI and scaling

The UI must remain visually compact at:
- 100%
- 125%
- 150%
- 175%

Do not use hardcoded physical pixels for screen-click coordinates without storing coordinate-space metadata.

## 12. Reference assets

See `reference/`.

Those images are authoritative for:
- layout
- relative spacing
- control order
- classic visual style

If written docs and image conflict on visual appearance, preserve the image unless it conflicts with a functional requirement.
