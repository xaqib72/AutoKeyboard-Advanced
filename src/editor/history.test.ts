import { describe, expect, it } from "vitest";
import { createAction, emptyWorkflow } from "./factories";
import { historyReducer, initialHistory } from "./history";

describe("editor history", () => {
  it("undoes and redoes workflow edits", () => {
    const initial = emptyWorkflow();
    const changed = { ...initial, actions: [createAction("wait")] };
    let history = historyReducer(initialHistory(initial), { type: "commit", workflow: changed });
    history = historyReducer(history, { type: "undo" });
    expect(history.present.actions).toHaveLength(0);
    history = historyReducer(history, { type: "redo" });
    expect(history.present.actions).toHaveLength(1);
  });

  it("does not add duplicate snapshots", () => {
    const initial = emptyWorkflow();
    const history = historyReducer(initialHistory(initial), {
      type: "commit",
      workflow: structuredClone(initial),
    });
    expect(history.past).toHaveLength(0);
  });
});
