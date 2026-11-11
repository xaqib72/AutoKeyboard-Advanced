import type { Workflow } from "../types/workflow";

export interface EditorHistory {
  past: Workflow[];
  present: Workflow;
  future: Workflow[];
}

export type HistoryAction =
  | { type: "commit"; workflow: Workflow }
  | { type: "replace"; workflow: Workflow }
  | { type: "undo" }
  | { type: "redo" };

export const initialHistory = (workflow: Workflow): EditorHistory => ({
  past: [],
  present: workflow,
  future: [],
});

export function historyReducer(state: EditorHistory, action: HistoryAction): EditorHistory {
  if (action.type === "replace") return initialHistory(structuredClone(action.workflow));
  if (action.type === "commit") {
    if (JSON.stringify(action.workflow) === JSON.stringify(state.present)) return state;
    return {
      past: [...state.past, state.present].slice(-100),
      present: structuredClone(action.workflow),
      future: [],
    };
  }
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous
      ? {
          past: state.past.slice(0, -1),
          present: previous,
          future: [state.present, ...state.future],
        }
      : state;
  }
  const next = state.future[0];
  return next
    ? { past: [...state.past, state.present], present: next, future: state.future.slice(1) }
    : state;
}
