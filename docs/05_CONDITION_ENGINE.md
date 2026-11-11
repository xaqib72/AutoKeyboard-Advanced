# 05 — Condition Engine Specification

## 1. Goal

Conditions are the core upgrade over fixed-delay macro tools.

A workflow should not need to guess how long a screen takes.

Instead:

`wait -> observe -> decide -> act`

## 2. Primitive conditions

### PixelMatch

Inputs:
- target point
- expected RGB
- tolerance per channel or Euclidean threshold
- coordinate space

Outputs:
- actual RGB
- match boolean

### PixelChanged

Inputs:
- target point
- baseline color
- tolerance

### ImagePresent

Inputs:
- template asset ID
- capture region
- threshold
- grayscale flag
- optional scale search

Outputs:
- found
- confidence
- bounding box
- center point

### ImageAbsent

Inverse of ImagePresent.

### WindowExists

Inputs:
- process matcher
- title matcher
- class matcher optional

### WindowActive

Same target + foreground requirement.

### OcrText

Inputs:
- region
- text matcher
- match mode
- language optional

Outputs:
- detected text
- confidence if available

### VariableCompare

Compare two values or variable vs literal.

### Always / Never

Useful for test and branch building.

## 3. Composite conditions

AST:

```ts
type ConditionExpression =
  | PrimitiveCondition
  | { op: "and"; items: ConditionExpression[] }
  | { op: "or"; items: ConditionExpression[] }
  | { op: "not"; item: ConditionExpression };
```

UI V1:
- simple condition dialog
- advanced "Add AND/OR" builder
- avoid a node graph

## 4. Wait loop behavior

Pseudo:

```text
start monotonic timer
while not cancelled:
    if paused:
        await resume
    result = evaluate(condition)
    emit condition sample/status
    if result == true:
        return success
    if timeout reached:
        return timeout
    await cancellable poll interval
```

## 5. Smart target clicking

Provide separate action:

`Find Image and Click`

Internally:
1. wait for image or single-evaluate
2. obtain bounding box
3. choose center or configured offset
4. convert to global coordinate
5. execute mouse action

This is safer and easier than making MouseAction secretly search.

## 6. Timeout semantics

Timeout values:
- finite milliseconds
- optional no-timeout allowed only after explicit warning

On timeout:
- stop
- skip
- retry
- jump
- set variable and continue

## 7. Condition test mode

Every visual condition dialog must have `Test`.

Test result UI:
- pass/fail
- actual value
- confidence
- elapsed detection time
- screenshot overlay for image match
- no mouse/keyboard side effect

## 8. Polling performance

Pixel:
- cheap
- can poll 50–250ms

Window:
- cheap
- 100–500ms

Image:
- medium/heavy
- default 250–500ms
- capture only selected region

OCR:
- heavy
- default 750–1500ms
- strongly encourage small region

Do not repeatedly capture full 4K screens for a tiny button.

## 9. Debounce/stability

Some UI elements flicker.

Optional condition stability:
- must be true for N consecutive samples
- or true continuously for X ms

Default:
- 1 sample

Advanced:
- `stableForMs`
- `requiredSamples`

## 10. Race handling

For "wait until appears then click":
- revalidate target immediately before click if more than configured max staleness has elapsed
- if target vanished, retry detection rather than clicking stale coordinates

## 11. Coordinate outputs

Visual matches return:
- screen-space bounding box
- center
- capture timestamp
- monitor ID

Never use a match from one monitor scale context as if it were another without conversion.
