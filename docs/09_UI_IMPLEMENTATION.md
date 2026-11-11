# 09 — UI Implementation Details

## 1. Technology

- React
- TypeScript
- hand-authored CSS
- no heavy visual component framework

State:
- Zustand or similarly small predictable state library is acceptable
- do not put runtime engine logic in React state

## 2. Main components

```text
App
├── TitleBridge
├── MenuBar
├── ClassicToolbar
├── ActionTable
├── BottomBar
├── StatusBar
└── DialogHost
```

Dialogs:
- KeystrokeDialog
- MouseDialog
- VariableDialog
- TextDialog
- WaitDialog
- ConditionDialog
- IfDialog
- LoopDialog
- WindowDialog
- ErrorDialog
- ValidationDialog
- SettingsDialog
- AboutDialog

## 3. Classic styling tokens

Define CSS variables:

```css
--bg-window
--bg-control
--bg-table
--border-light
--border-dark
--text-primary
--text-muted
--selection-bg
--selection-text
--row-running
--row-waiting
--row-error
```

Do not hardcode random colors in every component.

## 4. Toolbar

Requirements:
- 24–32 px style icons
- compact labels
- separators
- disabled-state visuals
- tooltips
- keyboard accessibility

Reference first-party toolbar icons may be recreated with an open icon set or original vector drawings adjusted to match the classic utility look.

## 5. Table

Need efficient rendering for:
- 1,000 actions without UI lag

Columns must support:
- resizing
- optional hiding
- stable header order
- keyboard navigation

Do not add pagination.

## 6. Dialog behavior

- centered over main window
- main window disabled while modal active
- Enter = OK where safe
- Esc = Cancel
- invalid fields show concise inline message
- preserve last-used values optionally

## 7. Coordinate capture UX

`Get Coordinate`:
- dialog can hide/minimize temporarily
- show small crosshair instruction
- capture current pointer on hotkey/click
- restore dialog with X/Y

Pixel capture:
- magnifier overlay optional later
- V1 can use same coordinate picker plus sampled color

Region capture:
- dim overlay
- drag rectangle
- Esc cancels
- show dimensions

## 8. Runtime feedback

When Start pressed:
- validate
- toolbar actions disabled appropriately
- Start becomes Pause or shows paired Pause/Stop controls
- current row highlighted
- status bar:
  - Running action 14/52
  - Waiting: ImagePresent
  - elapsed
  - repeat 2/10

## 9. Errors

Errors must be actionable.

Bad:
- `Action failed`

Good:
- `Mouse action 18 could not be sent. Target may be running as administrator.`

Visual condition failure:
- show timeout
- last confidence/value
- `Test Condition` shortcut from error dialog if relevant

## 10. Settings

Tabs:
- General
- Hotkeys
- Runtime
- Vision
- Logging

General:
- autosave
- recent files
- language

Hotkeys:
- Start
- Pause
- Stop

Runtime:
- default poll
- default timeout
- safety max iterations

Vision:
- image matching defaults
- OCR enabled/disabled

Logging:
- normal/debug
- retention

## 11. Accessibility

- all toolbar items keyboard reachable
- dialog labels linked to inputs
- visible focus
- do not encode state only by color
