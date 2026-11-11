# 15 — Sample Safe Workflows for Development

These examples are for generic desktop automation/QA.

## Example A — Fixed macro

1. Mouse click at X/Y
2. Wait 500ms
3. Ctrl+A
4. Type `hello`
5. Enter

Purpose:
- prove compatibility with classic macro behavior

## Example B — Variable timing

1. Click `Start Test` in local harness
2. Wait until green pixel appears, timeout 10s
3. Click coordinate
4. Type `done`

Harness randomly delays green state 1–7 seconds.

Acceptance:
- macro acts immediately after green state, not at a preselected fixed time

## Example C — Image appears

1. Local harness starts hidden Continue button
2. after random delay, button appears
3. Wait ImagePresent
4. Find Image and Click
5. wait for Success image

## Example D — Retry

1. Wait WindowExists 3s
2. on timeout retry 2 times
3. if still missing stop with clear error

## Example E — IF/ELSE

1. If pixel is green
2. type `PASS`
3. Else
4. type `FAIL`
5. End If

## Example F — Loop until

1. set counter 0
2. loop until pixel becomes green
3. increment counter
4. wait 250ms
5. end loop
6. type `${counter}`

## Example G — Window-relative click

1. resolve local test harness window
2. click 120,80 relative to client area
3. move window
4. run again
5. click still hits target

Purpose:
- verify relative coordinates.
