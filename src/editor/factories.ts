import type { ConditionExpression, Workflow, WorkflowAction } from "../types/workflow";

export type ActionType = WorkflowAction["type"];

export const emptyWorkflow = (): Workflow => ({
  schemaVersion: 1,
  name: "Untitled",
  repeatTimes: 1,
  actions: [],
});

const id = () => crypto.randomUUID();
const base = <T extends ActionType>(type: T, name: string) => ({
  id: id(),
  type,
  name,
  enabled: true,
  delayAfterMs: 50,
  generate: 1,
});

const always: ConditionExpression = { kind: "always" };

export function createAction(type: ActionType): WorkflowAction {
  switch (type) {
    case "keyboard":
      return {
        ...base(type, "Keystroke"),
        params: { keys: "Enter", mode: "press", interRepeatDelayMs: 0 },
      };
    case "mouse":
      return {
        ...base(type, "Click left button"),
        params: {
          kind: "click",
          button: "left",
          clickCount: 1,
          x: 0,
          y: 0,
          startX: 700,
          startY: 700,
          endX: 700,
          endY: 300,
          swipeDirection: "up",
          swipeDurationMs: 500,
          scrollDirection: "down",
          scrollNotches: 3,
          scrollIntervalMs: 30,
          coordinateSpace: "virtual_screen",
        },
      };
    case "text":
      return {
        ...base(type, "Text"),
        params: {
          text: "",
          method: "clipboard",
          stateMode: "none",
          clearFirst: false,
          wordWrap: false,
          linePerIteration: false,
        },
      };
    case "variable":
      return {
        ...base(type, "Set variable"),
        params: {
          variable: "var1",
          operation: "set",
          value: 0,
          increment: 1,
          minLength: 0,
          radix: 10,
          typingMethod: "keystroke",
          clearFirst: false,
        },
      };
    case "wait":
      return { ...base(type, "Wait"), delayAfterMs: 0, params: { durationMs: 500 } };
    case "wait_condition":
      return {
        ...base(type, "Wait for condition"),
        delayAfterMs: 0,
        params: {
          condition: always,
          pollIntervalMs: 250,
          timeoutMs: 10000,
          onTimeout: { mode: "stop" },
        },
      };
    case "if":
      return { ...base(type, "If"), delayAfterMs: 0, params: { condition: always } };
    case "else":
      return { ...base(type, "Else"), delayAfterMs: 0, params: {} };
    case "end_if":
      return { ...base(type, "End If"), delayAfterMs: 0, params: {} };
    case "loop_start":
      return {
        ...base(type, "Loop"),
        delayAfterMs: 0,
        params: { mode: "count", count: 2, maxIterations: 10000 },
      };
    case "loop_end":
      return { ...base(type, "End Loop"), delayAfterMs: 0, params: {} };
    case "break":
      return { ...base(type, "Break"), delayAfterMs: 0, params: {} };
    case "continue":
      return { ...base(type, "Continue"), delayAfterMs: 0, params: {} };
    case "label":
      return { ...base(type, "Label"), delayAfterMs: 0, params: { label: "label1" } };
    case "jump":
      return { ...base(type, "Jump"), delayAfterMs: 0, params: { targetRow: 1 } };
    case "window":
      return {
        ...base(type, "Window"),
        params: { operation: "activate", target: { title: "", titleMatch: "contains" } },
      };
    case "find_image_click":
      return {
        ...base(type, "Find Image and Click"),
        params: {
          templateAsset: "",
          threshold: 0.9,
          grayscale: false,
          button: "left",
          offsetX: 0,
          offsetY: 0,
          timeoutMs: 10000,
          pollIntervalMs: 350,
          onTimeout: { mode: "stop" },
        },
      };
    case "solve_shape_slider":
      return {
        ...base(type, "Solve shape slider puzzle"),
        params: {
          sourceRegion: undefined,
          targetRegion: undefined,
          sliderStartX: 100,
          sliderEndX: 400,
          sliderY: 700,
          threshold: 0.45,
          dragDurationMs: 700,
        },
      };
    case "comment":
      return { ...base(type, "Comment"), delayAfterMs: 0, params: { text: "" } };
  }
}
