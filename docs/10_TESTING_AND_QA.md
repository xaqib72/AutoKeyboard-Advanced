# 10 — Testing and QA Plan

## 1. Test layers

### Unit tests

Rust:
- action validation
- jump target compilation
- condition AST
- variable interpolation
- timing calculations
- cancellation behavior
- project migration
- coordinate transforms

TypeScript:
- editor reducers/store
- dialogs validation
- row rendering
- schema mapping

Python:
- template matching on known fixtures
- invalid image errors
- threshold behavior

## 2. Integration tests

### Engine fake backend

Create fake input provider and fake condition provider.

This allows deterministic tests:

- wait false false true
- timeout
- retry
- nested if
- loops
- cancellation
- pause/resume
- repeat times

No real mouse movement in most CI tests.

## 3. Native Windows tests

Dedicated manual/automated harness app should expose:
- buttons at known coordinates
- text boxes
- color swatches
- delayed appearance
- delayed disappearance
- moving window
- DPI test grid

Test workflow:
1. wait button
2. click
3. wait text
4. type
5. validate harness state

## 4. Condition fixtures

Image:
- exact match
- no match
- brightness shift
- small scale difference
- cropped
- multiple monitors

Pixel:
- exact
- tolerance boundary
- changed

OCR:
- simple high-contrast text
- if enabled

## 5. Timing tests

- 50ms post delays
- 100ms
- 500ms
- 5s
- cancellation in long wait
- pause during timeout

Do not promise real-time precision. Measure actual drift and define acceptable tolerance.

## 6. Stop isolation

Critical:

Start workflow with:
- key down
- long wait
- image wait

Press emergency stop.

Assert:
- run cancelled
- no additional input
- held keys/buttons released
- Python child not wedged
- next fresh workflow can run

## 7. Persistence tests

- save/open equality
- dirty flag
- crash recovery
- missing asset
- corrupted ZIP
- unknown schema
- migration from old schema
- Unicode text
- very large action list

## 8. UI regression

Maintain screenshots of:
- main empty window
- populated workflow
- Keystroke dialog
- Mouse dialog
- Variable dialog
- Text dialog
- Condition dialog

Compare manually/pixel-wise with reference target during UI milestone.

## 9. Performance tests

Measure:
- cold launch
- idle RAM
- idle CPU
- 1,000-row editor
- normal click workflow RAM/CPU
- first CV sidecar start
- repeated image matching

## 10. Acceptance quality bar

No release if:
- stop can fail to stop
- project save can corrupt existing file
- mixed DPI coordinates are wrong
- UI freezes during waits
- sidecar orphan remains
- malformed condition flow can crash runtime
- typing can leave Ctrl/Alt/Shift stuck

## 11. Manual acceptance checklist

- [ ] Main UI visually matches reference layout
- [ ] Core toolbar order matches
- [ ] Add/edit/delete/reorder works
- [ ] Simple macro works without Python process
- [ ] Global stop works when app unfocused
- [ ] Image wait adapts to variable target timing
- [ ] Timeout branch works
- [ ] Pixel wait works
- [ ] If/Else works
- [ ] Loop works
- [ ] Save/open works
- [ ] Restart recovery works
- [ ] 125%/150% DPI tested
