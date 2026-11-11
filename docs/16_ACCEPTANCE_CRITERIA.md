# 16 — Release Acceptance Criteria

## Core parity

- [ ] Main layout matches reference
- [ ] Toolbar locked buttons and order match reference
- [ ] Keystroke dialog parity
- [ ] Mouse dialog parity
- [ ] Variable dialog parity
- [ ] Text dialog parity
- [ ] action table parity fields
- [ ] Repeat Times
- [ ] New/Open/Save
- [ ] Up/Down/Delete
- [ ] Start

## Advanced engine

- [ ] Fixed Wait
- [ ] Wait Pixel
- [ ] Wait Window
- [ ] Wait Image
- [ ] timeout
- [ ] retry
- [ ] if/else
- [ ] loops
- [ ] variables
- [ ] image result coordinates
- [ ] Find Image and Click
- [ ] global pause/stop
- [ ] logs

## Reliability

- [ ] no UI freeze
- [ ] no stuck key/button
- [ ] no orphan Python
- [ ] no action after Stop
- [ ] project never silently corrupts
- [ ] mixed DPI tested
- [ ] multi-monitor tested
- [ ] target elevation limitation produces useful message

## Performance

- [ ] Python not running for basic macro
- [ ] idle CPU effectively negligible
- [ ] 1,000-row editor usable
- [ ] condition polls respect interval
- [ ] CV uses selected region

## Packaging

- [ ] clean machine installer test
- [ ] sidecar bundled correctly if needed
- [ ] no external Python installation required
- [ ] uninstall clean
- [ ] project files survive app upgrade
