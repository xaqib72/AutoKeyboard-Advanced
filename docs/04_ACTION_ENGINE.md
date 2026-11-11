# 04 — Workflow / Action Engine Specification

## 1. Core model

A workflow is an ordered list of strongly typed actions.

Every action has:

```ts
type BaseAction = {
  id: string;
  type: string;
  name?: string;
  enabled: boolean;
  delayAfterMs: number;
  generate: number;
  guard?: ConditionExpression;
  retry?: RetryPolicy;
  failurePolicy?: FailurePolicy;
  comment?: string;
};
```

`generate` means execute the action body N times before `delayAfterMs`, unless action-specific semantics override it.

## 2. Execution contract

For each action:

1. check cancellation
2. if paused, await resume
3. evaluate guard if present
4. if guard false, apply guard policy
5. execute action
6. retry if configured
7. store outputs/variables
8. apply post-delay
9. emit completion event
10. advance instruction pointer

Every awaitable step must be cancellable.

## 3. Action catalog

### A. KeyboardAction

Fields:
- keys/chord
- mode: press/down/up
- generate
- interRepeatDelayMs
- delayAfterMs

### B. MouseAction

Fields:
- kind
- button
- clickCount
- coordinate
- coordinateSpace
- targetWindow?
- generate
- restoreCursor?
- delayAfterMs

### C. TextAction

Fields:
- text template
- method:
  - clipboard
  - unicode input
  - keystroke simulation
- state mode compatibility fields
- generate
- delayAfterMs

### D. VariableAction

Operations:
- set
- increment
- decrement
- append
- clear
- cast

### E. WaitAction

- duration
- cancellable

### F. WaitConditionAction

- condition
- pollIntervalMs
- timeoutMs
- onTimeout

### G. IfAction / ElseAction / EndIfAction

Runtime validator precomputes jump targets.

### H. LoopStart / LoopEnd

Modes:
- count
- while
- until

Runtime maintains loop stack.

### I. BreakAction / ContinueAction

Only valid in loop.

### J. LabelAction

Named target.

### K. JumpAction

- label
- optional condition

### L. WindowAction

Operations:
- activate
- restore
- minimize
- wait exists
- wait active

Avoid destructive process control in V1.

### M. SetClipboardAction

Explicit clipboard set/read if needed.

### N. CommentAction

No-op, visual organization.

### O. ScreenshotAction

For debugging/QA:
- capture target
- save to user-selected or project diagnostic path

## 4. Failure policy

```ts
type FailurePolicy =
  | { mode: "stop" }
  | { mode: "skip" }
  | { mode: "jump"; label: string }
  | { mode: "continue_warning" };
```

Retry wraps action execution before failure policy.

```ts
type RetryPolicy = {
  maxAttempts: number;
  delayMs: number;
  backoff?: "fixed" | "linear";
};
```

No infinite retry by default.

## 5. Timing rules

- all durations stored as integer milliseconds
- monotonic clock for elapsed timeout
- do not use wall-clock time for short waits
- minimum poll interval should prevent CPU spin
- default condition poll: 250 ms
- allow 50 ms for pixel checks if user chooses
- warn if OCR poll interval is too aggressive

## 6. Repeat Times

Main-window Repeat Times wraps entire workflow.

Values:
- integer >= 1
- optional "Until Stopped" can be a future explicit mode

Runtime variables:
- `${run.repeatIndex}`
- `${run.repeatCount}`

## 7. Variables

Scopes:

### Workflow scope
Persists for current run.

### Built-in runtime vars
Read-only:
- run.id
- run.repeatIndex
- action.index
- last.status
- last.durationMs

### Condition outputs
Example:
- image confidence
- matched X/Y
- OCR text

## 8. Expression system

Do not embed JavaScript eval.

Implement a restricted expression parser supporting:

- `== != > >= < <=`
- AND / OR / NOT
- parentheses
- variable lookup
- string contains
- regex optionally

No arbitrary code execution.

## 9. Runtime validation before Start

Reject run if:
- malformed IF blocks
- malformed loops
- jump to missing label
- duplicate label
- missing image asset
- invalid coordinate
- invalid timeout
- unknown action type
- required sidecar unavailable for an action
- unresolved schema migration error

Show validation dialog with clickable rows.
