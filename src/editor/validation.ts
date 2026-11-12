import type { ConditionExpression, ValidationIssue, Workflow } from "../types/workflow";
import { swipeDirectionMatches } from "./swipe";

function validateCondition(
  condition: ConditionExpression,
  index: number,
  issues: ValidationIssue[],
) {
  if ("op" in condition) {
    if (condition.op === "not") validateCondition(condition.item, index, issues);
    else {
      if (condition.items.length === 0)
        issues.push({
          actionIndex: index,
          code: "EMPTY_CONDITION",
          message: "Composite condition has no items.",
        });
      condition.items.forEach((item) => validateCondition(item, index, issues));
    }
    return;
  }
  if (
    (condition.kind === "image_present" || condition.kind === "image_absent") &&
    !condition.templateAsset.trim()
  ) {
    issues.push({
      actionIndex: index,
      code: "ASSET_MISSING",
      message: "An image condition needs a template asset.",
    });
  }
  if (
    (condition.kind === "image_present" || condition.kind === "image_absent") &&
    (condition.threshold < 0.1 || condition.threshold > 1)
  ) {
    issues.push({
      actionIndex: index,
      code: "INVALID_IMAGE_SEARCH",
      message: "Image similarity must be between 0.1 and 1.",
    });
  }
  if (
    (condition.kind === "image_present" || condition.kind === "image_absent") &&
    condition.region &&
    (condition.region.width < 1 || condition.region.height < 1)
  ) {
    issues.push({
      actionIndex: index,
      code: "INVALID_REGION",
      message: "Image search area width and height must be at least 1 pixel.",
    });
  }
  if (
    (condition.kind === "window_exists" || condition.kind === "window_active") &&
    !condition.target.title?.trim() &&
    !condition.target.process?.trim()
  ) {
    issues.push({
      actionIndex: index,
      code: "TARGET_WINDOW_MISSING",
      message: "A window condition needs a title or process name.",
    });
  }
  if (
    (condition.kind === "window_exists" || condition.kind === "window_active") &&
    condition.target.titleMatch === "regex" &&
    condition.target.title
  ) {
    try {
      new RegExp(condition.target.title);
    } catch {
      issues.push({
        actionIndex: index,
        code: "INVALID_REGEX",
        message: "Window title regular expression is invalid.",
      });
    }
  }
}

export function validateWorkflow(workflow: Workflow): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ifStack: Array<{ index: number; hasElse: boolean }> = [];
  const loopStack: number[] = [];
  const labels = new Map<string, number>();

  if (!Number.isInteger(workflow.repeatTimes) || workflow.repeatTimes < 1) {
    issues.push({ code: "INVALID_REPEAT", message: "Repeat Times must be at least 1." });
  }
  const ids = new Set<string>();
  workflow.actions.forEach((action, index) => {
    const row = index + 1;
    if (ids.has(action.id))
      issues.push({
        actionId: action.id,
        actionIndex: row,
        code: "DUPLICATE_ID",
        message: "Action ID is duplicated.",
      });
    ids.add(action.id);
    if (action.delayAfterMs < 0 || action.generate < 1) {
      issues.push({
        actionId: action.id,
        actionIndex: row,
        code: "INVALID_TIMING",
        message: "Delay must be non-negative and Generate at least 1.",
      });
    }
    if (action.guard) validateCondition(action.guard, row, issues);
    switch (action.type) {
      case "if":
        ifStack.push({ index: row, hasElse: false });
        validateCondition(action.params.condition, row, issues);
        break;
      case "else": {
        const block = ifStack.at(-1);
        if (!block)
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "ORPHAN_ELSE",
            message: "Else has no matching If.",
          });
        else if (block.hasElse)
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "DUPLICATE_ELSE",
            message: "If block has more than one Else.",
          });
        else block.hasElse = true;
        break;
      }
      case "end_if":
        if (!ifStack.pop())
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "ORPHAN_END_IF",
            message: "End If has no matching If.",
          });
        break;
      case "loop_start":
        loopStack.push(row);
        if (
          !["count", "while", "until"].includes(action.params.mode) ||
          action.params.maxIterations < 1 ||
          (action.params.mode === "count" && action.params.count < 1)
        )
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_LOOP",
            message:
              "Loop mode must be count/while/until, and count and safety limit must be at least 1.",
          });
        if (action.params.mode !== "count" && action.params.condition)
          validateCondition(action.params.condition, row, issues);
        break;
      case "loop_end":
        if (!loopStack.pop())
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "ORPHAN_LOOP_END",
            message: "End Loop has no matching Loop.",
          });
        break;
      case "break":
      case "continue":
        if (loopStack.length === 0)
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "OUTSIDE_LOOP",
            message: `${action.name} must be inside a loop.`,
          });
        break;
      case "label":
        if (!action.params.label.trim())
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "EMPTY_LABEL",
            message: "Label cannot be empty.",
          });
        else if (labels.has(action.params.label))
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "DUPLICATE_LABEL",
            message: `Label '${action.params.label}' is duplicated.`,
          });
        else labels.set(action.params.label, row);
        break;
      case "wait_condition":
        validateCondition(action.params.condition, row, issues);
        if (action.params.pollIntervalMs < 50 || action.params.timeoutMs < 0)
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_WAIT",
            message: "Condition poll must be at least 50 ms and timeout non-negative.",
          });
        break;
      case "mouse":
        if (
          action.params.kind === "swipe" &&
          (!Number.isInteger(action.params.swipeDurationMs) ||
            action.params.swipeDurationMs < 10 ||
            action.params.swipeDurationMs > 300_000 ||
            (action.params.startX === action.params.endX &&
              action.params.startY === action.params.endY))
        )
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_SWIPE",
            message: "Swipe needs two different coordinates and a time between 10 and 300000 ms.",
          });
        if (action.params.kind === "swipe" && !swipeDirectionMatches(action.params))
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "SWIPE_DIRECTION_MISMATCH",
            message: `End coordinate does not point ${action.params.swipeDirection} from Start.`,
          });
        if (
          action.params.kind === "scroll" &&
          (!Number.isInteger(action.params.x) ||
            !Number.isInteger(action.params.y) ||
            !["up", "down"].includes(action.params.scrollDirection) ||
            !Number.isInteger(action.params.scrollNotches) ||
            action.params.scrollNotches < 1 ||
            action.params.scrollNotches > 10_000 ||
            !Number.isInteger(action.params.scrollIntervalMs) ||
            action.params.scrollIntervalMs < 0 ||
            action.params.scrollIntervalMs > 60_000)
        )
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_SCROLL",
            message:
              "Scroll needs Up or Down, 1 to 10000 wheel steps, and a step interval from 0 to 60000 ms.",
          });
        break;
      case "window":
        if (!action.params.target.title?.trim() && !action.params.target.process?.trim())
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "TARGET_WINDOW_MISSING",
            message: "Window action needs a title or process name.",
          });
        if (action.params.target.titleMatch === "regex" && action.params.target.title) {
          try {
            new RegExp(action.params.target.title);
          } catch {
            issues.push({
              actionId: action.id,
              actionIndex: row,
              code: "INVALID_REGEX",
              message: "Window title regular expression is invalid.",
            });
          }
        }
        break;
      case "find_image_click":
        if (!action.params.templateAsset.trim())
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "ASSET_MISSING",
            message: "Find Image and Click needs a template image.",
          });
        if (
          action.params.threshold < 0.1 ||
          action.params.threshold > 1 ||
          action.params.pollIntervalMs < 50 ||
          action.params.timeoutMs < 0
        )
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_IMAGE_SEARCH",
            message:
              "Image similarity must be 0.1–1, poll interval at least 50 ms, and timeout non-negative.",
          });
        if (
          action.params.region &&
          (action.params.region.width < 1 || action.params.region.height < 1)
        )
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_REGION",
            message: "Image search area width and height must be at least 1 pixel.",
          });
        if (
          action.params.onTimeout?.mode === "jump" &&
          (!Number.isInteger(action.params.onTimeout.targetRow) ||
            action.params.onTimeout.targetRow < 1 ||
            action.params.onTimeout.targetRow > workflow.actions.length)
        )
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_TIMEOUT_JUMP_ROW",
            message: `Image timeout jump row must be between 1 and ${workflow.actions.length}.`,
          });
        break;
      case "solve_shape_slider": {
        const regions = [action.params.sourceRegion, action.params.targetRegion];
        if (regions.some((region) => !region || region.width < 3 || region.height < 3))
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_SHAPE_REGIONS",
            message: "Shape slider needs source and target areas at least 3 × 3 pixels.",
          });
        if (
          action.params.threshold < 0.1 ||
          action.params.threshold > 1 ||
          action.params.sliderStartX === action.params.sliderEndX ||
          action.params.dragDurationMs < 100 ||
          action.params.dragDurationMs > 10000
        )
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "INVALID_SHAPE_SLIDER",
            message:
              "Shape similarity must be 0.1–1, slider endpoints must differ, and drag duration must be 100–10000 ms.",
          });
        const onFailure = action.params.onFailure;
        if (!onFailure) {
          issues.push({
            actionId: action.id,
            actionIndex: row,
            code: "MISSING_SHAPE_FAILURE_ACTION",
            message: "Choose what to do if the shape is not recognized.",
          });
        } else if (onFailure.mode === "jump") {
          if (
            !Number.isInteger(onFailure.targetRow) ||
            onFailure.targetRow < 1 ||
            onFailure.targetRow > workflow.actions.length
          )
            issues.push({
              actionId: action.id,
              actionIndex: row,
              code: "INVALID_SHAPE_FAILURE_ROW",
              message: `Shape failure jump row must be between 1 and ${workflow.actions.length}.`,
            });
        } else {
          const point = onFailure.reloadPoint;
          if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y))
            issues.push({
              actionId: action.id,
              actionIndex: row,
              code: "MISSING_SHAPE_RELOAD_POINT",
              message: "Capture the reload button coordinates for shape retry mode.",
            });
          if (
            !Number.isInteger(onFailure.retryDelayMs) ||
            onFailure.retryDelayMs < 100 ||
            onFailure.retryDelayMs > 60000
          )
            issues.push({
              actionId: action.id,
              actionIndex: row,
              code: "INVALID_SHAPE_RETRY_DELAY",
              message: "Wait after reload must be between 100 and 60000 ms.",
            });
        }
        break;
      }
      default:
        break;
    }
  });
  ifStack.forEach((block) =>
    issues.push({
      actionIndex: block.index,
      code: "UNCLOSED_IF",
      message: "If block is missing End If.",
    }),
  );
  loopStack.forEach((index) =>
    issues.push({
      actionIndex: index,
      code: "UNCLOSED_LOOP",
      message: "Loop is missing End Loop.",
    }),
  );
  workflow.actions.forEach((action, index) => {
    if (action.type === "jump") {
      const targetRow = action.params.targetRow;
      if (Number.isInteger(targetRow)) {
        if (targetRow < 1 || targetRow > workflow.actions.length)
          issues.push({
            actionId: action.id,
            actionIndex: index + 1,
            code: "INVALID_JUMP_ROW",
            message: `Jump row must be between 1 and ${workflow.actions.length}.`,
          });
      } else if (!action.params.label || !labels.has(action.params.label)) {
        issues.push({
          actionId: action.id,
          actionIndex: index + 1,
          code: "INVALID_JUMP_ROW",
          message: `Jump row must be between 1 and ${workflow.actions.length}.`,
        });
      }
    }
    if (
      action.type === "wait_condition" &&
      action.params.onTimeout.mode === "jump" &&
      !labels.has(action.params.onTimeout.label)
    ) {
      issues.push({
        actionId: action.id,
        actionIndex: index + 1,
        code: "MISSING_LABEL",
        message: `Timeout jump target '${action.params.onTimeout.label}' does not exist.`,
      });
    }
  });
  return issues;
}
