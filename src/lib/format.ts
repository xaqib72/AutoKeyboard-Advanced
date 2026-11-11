import type { ConditionExpression, WorkflowAction } from "../types/workflow";

export const actionTypeLabel: Record<WorkflowAction["type"], string> = {
  keyboard: "Keystroke",
  mouse: "Mouse",
  variable: "Variable",
  text: "Text",
  wait: "Wait",
  wait_condition: "Condition",
  if: "If",
  else: "Else",
  end_if: "End If",
  loop_start: "Loop",
  loop_end: "End Loop",
  break: "Break",
  continue: "Continue",
  label: "Label",
  jump: "Jump",
  window: "Window",
  find_image_click: "Image Click",
  comment: "Comment",
};

export function describeCondition(condition: ConditionExpression): string {
  if ("op" in condition) {
    if (condition.op === "not") return `NOT (${describeCondition(condition.item)})`;
    return condition.items.map(describeCondition).join(` ${condition.op.toUpperCase()} `);
  }
  switch (condition.kind) {
    case "always":
      return "Always";
    case "never":
      return "Never";
    case "variable_compare":
      return `${condition.variable} ${condition.operator} ${String(condition.value)}`;
    case "pixel_match":
      return `Pixel ${condition.x},${condition.y} = rgb(${condition.rgb.join(",")})`;
    case "pixel_changed":
      return `Pixel ${condition.x},${condition.y} changed`;
    case "window_exists":
      return `Window exists: ${condition.target.title ?? condition.target.process ?? "target"}`;
    case "window_active":
      return `Window active: ${condition.target.title ?? condition.target.process ?? "target"}`;
    case "image_present":
      return `Image appears: ${condition.templateAsset || "(choose image)"}`;
    case "image_absent":
      return `Image disappears: ${condition.templateAsset || "(choose image)"}`;
  }
}

export function actionDetails(action: WorkflowAction): string {
  switch (action.type) {
    case "keyboard":
      return `${action.params.keys} (${action.params.mode})`;
    case "mouse":
      if (action.params.kind === "swipe")
        return `Swipe ${action.params.swipeDirection}, (${action.params.startX},${action.params.startY}) → (${action.params.endX},${action.params.endY}), ${action.params.swipeDurationMs} ms × ${action.generate}`;
      if (action.params.kind === "scroll")
        return `Scroll ${action.params.scrollDirection}, ${action.params.scrollNotches} wheel steps at X=${action.params.x}, Y=${action.params.y} × ${action.generate}`;
      return `${action.params.kind === "click" && action.params.clickCount === 2 ? "Double-click" : action.params.kind} ${action.params.button}, X=${action.params.x}, Y=${action.params.y}`;
    case "text":
      return action.params.text.replace(/\s+/g, " ").slice(0, 80) || "None state";
    case "variable":
      return `${action.params.variable} ${action.params.operation} ${String(action.params.value)}`;
    case "wait":
      return `${action.params.durationMs} ms`;
    case "wait_condition":
      return describeCondition(action.params.condition);
    case "if":
      return describeCondition(action.params.condition);
    case "loop_start":
      return action.params.mode === "count"
        ? `${action.params.count} times`
        : action.params.condition
          ? describeCondition(action.params.condition)
          : action.params.mode;
    case "label":
      return action.params.label;
    case "jump":
      return `Jump to row ${action.params.targetRow ?? "?"}`;
    case "window":
      return `${action.params.operation}: ${action.params.target.title ?? action.params.target.process ?? "target"}`;
    case "find_image_click":
      return action.params.templateAsset || "Choose image";
    case "comment":
      return action.params.text;
    default:
      return "";
  }
}

export function pixelColor(action: WorkflowAction): string {
  if (
    action.type === "wait_condition" &&
    !("op" in action.params.condition) &&
    (action.params.condition.kind === "pixel_match" ||
      action.params.condition.kind === "pixel_changed")
  ) {
    return `#${action.params.condition.rgb
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
  }
  return "";
}
