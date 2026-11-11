import type { MouseAction, Workflow, WorkflowAction } from "../types/workflow";
import { insertActionAfterSelection } from "./insertion";

const DOUBLE_CLICK_MS = 500;
const DOUBLE_CLICK_DISTANCE = 5;

function isSingleClick(action: WorkflowAction): action is MouseAction {
  return (
    action.type === "mouse" && action.params.kind === "click" && action.params.clickCount === 1
  );
}

function recordedEventIds(action: WorkflowAction): string[] {
  return Array.isArray(action.recordedEventIds)
    ? action.recordedEventIds.filter((id): id is string => typeof id === "string")
    : [action.id];
}

export function appendRecordedAction(
  workflow: Workflow,
  action: WorkflowAction,
  selectedId?: string,
): Workflow {
  if (
    workflow.actions.some(
      (existing) => existing.id === action.id || recordedEventIds(existing).includes(action.id),
    )
  )
    return workflow;
  let actions = [...workflow.actions];
  const selectedIndex = selectedId
    ? actions.findIndex((candidate) => candidate.id === selectedId)
    : actions.length - 1;
  const insertionIndex = selectedIndex >= 0 ? selectedIndex + 1 : actions.length;
  const previous = actions[insertionIndex - 1];
  if (
    previous &&
    isSingleClick(previous) &&
    isSingleClick(action) &&
    previous.params.button === action.params.button &&
    action.delayAfterMs <= DOUBLE_CLICK_MS &&
    Math.abs(previous.params.x - action.params.x) <= DOUBLE_CLICK_DISTANCE &&
    Math.abs(previous.params.y - action.params.y) <= DOUBLE_CLICK_DISTANCE
  ) {
    actions[insertionIndex - 1] = {
      ...previous,
      name: `Double-click ${previous.params.button} button`,
      params: { ...previous.params, clickCount: 2 },
      recordedEventIds: [...new Set([...recordedEventIds(previous), action.id])],
    };
    return { ...workflow, actions };
  }
  actions = insertActionAfterSelection(actions, action, selectedId);
  return { ...workflow, actions };
}

export function actionIdForRecordedEvent(workflow: Workflow, eventId: string): string | undefined {
  return workflow.actions.find(
    (action) => action.id === eventId || recordedEventIds(action).includes(eventId),
  )?.id;
}

export function removeDuplicateRecordedEvents(workflow: Workflow): Workflow {
  const seen = new Map<string, WorkflowAction>();
  const actions = workflow.actions.filter((action) => {
    const existing = seen.get(action.id);
    if (!existing) {
      seen.set(action.id, action);
      return true;
    }
    return JSON.stringify(existing) !== JSON.stringify(action);
  });
  return actions.length === workflow.actions.length ? workflow : { ...workflow, actions };
}
