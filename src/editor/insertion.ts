import type { WorkflowAction } from "../types/workflow";

export function insertActionAfterSelection(
  actions: readonly WorkflowAction[],
  action: WorkflowAction,
  selectedId?: string,
): WorkflowAction[] {
  const next = [...actions];
  const selectedIndex = selectedId
    ? next.findIndex((candidate) => candidate.id === selectedId)
    : -1;
  next.splice(selectedIndex >= 0 ? selectedIndex + 1 : next.length, 0, action);
  return next;
}
