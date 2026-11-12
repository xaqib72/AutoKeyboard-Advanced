export type RunState =
  | "idle"
  | "starting"
  | "running"
  | "waiting"
  | "paused"
  | "stopping"
  | "completed"
  | "failed"
  | "cancelled";

export type CoordinateSpace = "virtual_screen" | "monitor" | "window_client" | "window_frame";
export type FailurePolicy =
  | { mode: "stop" }
  | { mode: "skip" }
  | { mode: "jump"; label: string }
  | { mode: "continue_warning" };

export interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
  backoff?: "fixed" | "linear";
}

export interface TargetWindow {
  title?: string;
  titleMatch?: "contains" | "exact" | "regex";
  process?: string;
  className?: string;
}

export type PrimitiveCondition =
  | { kind: "always" }
  | { kind: "never" }
  | {
      kind: "variable_compare";
      variable: string;
      operator: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains";
      value: string | number | boolean;
    }
  | {
      kind: "pixel_match" | "pixel_changed";
      x: number;
      y: number;
      rgb: [number, number, number];
      tolerance: number;
      coordinateSpace?: CoordinateSpace;
    }
  | { kind: "window_exists" | "window_active"; target: TargetWindow }
  | {
      kind: "image_present" | "image_absent";
      templateAsset: string;
      threshold: number;
      grayscale: boolean;
      region?: { x: number; y: number; width: number; height: number };
    };

export type ConditionExpression =
  | PrimitiveCondition
  | { op: "and" | "or"; items: ConditionExpression[] }
  | { op: "not"; item: ConditionExpression };

interface ActionBase<T extends string, P> {
  id: string;
  type: T;
  name: string;
  enabled: boolean;
  delayAfterMs: number;
  generate: number;
  params: P;
  guard?: ConditionExpression | null;
  retry?: RetryPolicy | null;
  failurePolicy?: FailurePolicy | null;
  comment?: string | null;
  [futureField: string]: unknown;
}

export type KeyboardAction = ActionBase<
  "keyboard",
  { keys: string; mode: "press" | "down" | "up"; interRepeatDelayMs: number }
>;
export type MouseAction = ActionBase<
  "mouse",
  {
    kind: "click" | "move" | "down" | "up" | "swipe" | "scroll";
    button: "left" | "middle" | "right";
    clickCount: 1 | 2;
    x: number;
    y: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    swipeDirection: "up" | "down" | "left" | "right";
    swipeDurationMs: number;
    scrollDirection: "up" | "down";
    scrollNotches: number;
    scrollIntervalMs: number;
    coordinateSpace: CoordinateSpace;
    targetWindow?: TargetWindow;
    restoreCursor?: boolean;
  }
>;
export type TextAction = ActionBase<
  "text",
  {
    text: string;
    method: "clipboard" | "unicode" | "keystroke";
    stateMode: "none" | "read" | "replace";
    stateValue?: string;
    clearFirst?: boolean;
    wordWrap?: boolean;
    linePerIteration?: boolean;
  }
>;
export type VariableAction = ActionBase<
  "variable",
  {
    variable: string;
    operation: "set" | "increment" | "decrement" | "append" | "clear" | "cast";
    value: string | number | boolean;
    increment: number;
    minLength: number;
    radix: 2 | 8 | 10 | 16;
    typingMethod?: "clipboard" | "unicode" | "keystroke";
    clearFirst?: boolean;
  }
>;
export type WaitAction = ActionBase<"wait", { durationMs: number }>;
export type WaitConditionAction = ActionBase<
  "wait_condition",
  {
    condition: ConditionExpression;
    pollIntervalMs: number;
    timeoutMs: number;
    onTimeout: FailurePolicy;
    saveResultTo?: string;
  }
>;
export type IfAction = ActionBase<"if", { condition: ConditionExpression }>;
export type ElseAction = ActionBase<"else", Record<string, never>>;
export type EndIfAction = ActionBase<"end_if", Record<string, never>>;
export type LoopStartAction = ActionBase<
  "loop_start",
  {
    mode: "count" | "while" | "until";
    count: number;
    condition?: ConditionExpression;
    maxIterations: number;
  }
>;
export type LoopEndAction = ActionBase<"loop_end", Record<string, never>>;
export type BreakAction = ActionBase<"break", Record<string, never>>;
export type ContinueAction = ActionBase<"continue", Record<string, never>>;
export type LabelAction = ActionBase<"label", { label: string }>;
export type JumpAction = ActionBase<
  "jump",
  {
    /** One-based row number. `label` is retained only to open projects saved by older versions. */
    targetRow: number;
    label?: string;
    condition?: ConditionExpression;
  }
>;
export type WindowAction = ActionBase<
  "window",
  {
    operation: "activate" | "restore" | "minimize" | "wait_exists" | "wait_active";
    target: TargetWindow;
  }
>;
export type FindImageClickAction = ActionBase<
  "find_image_click",
  {
    templateAsset: string;
    threshold: number;
    grayscale: boolean;
    button: "left" | "middle" | "right";
    offsetX: number;
    offsetY: number;
    timeoutMs: number;
    pollIntervalMs: number;
    onTimeout: { mode: "stop" } | { mode: "jump"; targetRow: number };
    region?: { x: number; y: number; width: number; height: number };
  }
>;
export type SolveShapeSliderAction = ActionBase<
  "solve_shape_slider",
  {
    sourceRegion?: { x: number; y: number; width: number; height: number };
    targetRegion?: { x: number; y: number; width: number; height: number };
    sliderStartX: number;
    sliderEndX: number;
    sliderY: number;
    threshold: number;
    dragDurationMs: number;
    onFailure:
      | { mode: "jump"; targetRow: number }
      | { mode: "reload_retry"; reloadPoint?: { x: number; y: number }; retryDelayMs: number };
  }
>;
export type CommentAction = ActionBase<"comment", { text: string }>;

export type WorkflowAction =
  | KeyboardAction
  | MouseAction
  | TextAction
  | VariableAction
  | WaitAction
  | WaitConditionAction
  | IfAction
  | ElseAction
  | EndIfAction
  | LoopStartAction
  | LoopEndAction
  | BreakAction
  | ContinueAction
  | LabelAction
  | JumpAction
  | WindowAction
  | FindImageClickAction
  | SolveShapeSliderAction
  | CommentAction;

export interface Workflow {
  schemaVersion: number;
  name: string;
  repeatTimes: number;
  actions: WorkflowAction[];
  [futureField: string]: unknown;
}

export interface ValidationIssue {
  actionId?: string;
  actionIndex?: number;
  code: string;
  message: string;
}

export interface RunStateEvent {
  runId?: string;
  state: RunState;
  repeatIndex?: number;
  actionId?: string;
  actionIndex?: number;
  message?: string;
  elapsedMs?: number;
}

export interface ActionStateEvent {
  runId: string;
  actionId: string;
  state: "running" | "waiting" | "completed" | "failed" | "skipped";
  attempt: number;
  message?: string;
}

export interface RunLogEntry {
  timestamp: string;
  runId: string;
  actionId?: string;
  actionIndex?: number;
  actionName?: string;
  state: string;
  result?: string;
  durationMs?: number;
  retryCount?: number;
  errorCode?: string;
  message?: string;
}
