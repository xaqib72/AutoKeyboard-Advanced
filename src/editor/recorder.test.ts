import { describe, expect, it } from "vitest";
import { createAction, emptyWorkflow } from "./factories";
import {
  actionIdForRecordedEvent,
  appendRecordedAction,
  removeDuplicateRecordedEvents,
} from "./recorder";

function click(x: number, y: number, delayAfterMs: number) {
  const action = createAction("mouse");
  if (action.type !== "mouse") throw new Error("Unexpected factory result");
  action.params = { ...action.params, kind: "click", button: "left", clickCount: 1, x, y };
  action.delayAfterMs = delayAfterMs;
  return action;
}

describe("recorded mouse clicks", () => {
  it("merges a nearby rapid pair into one double-click action", () => {
    let workflow = appendRecordedAction(emptyWorkflow(), click(300, 220, 1000));
    workflow = appendRecordedAction(workflow, click(302, 218, 180));
    expect(workflow.actions).toHaveLength(1);
    expect(workflow.actions[0]).toMatchObject({
      name: "Double-click left button",
      params: { clickCount: 2, x: 300, y: 220 },
    });
  });

  it("keeps slow or distant clicks separate", () => {
    let workflow = appendRecordedAction(emptyWorkflow(), click(100, 100, 900));
    workflow = appendRecordedAction(workflow, click(130, 100, 120));
    workflow = appendRecordedAction(workflow, click(130, 100, 700));
    expect(workflow.actions).toHaveLength(3);
  });

  it("inserts recording events below the selected row and keeps recording order", () => {
    const workflow = emptyWorkflow();
    const before = createAction("wait");
    const after = createAction("text");
    workflow.actions = [before, after];

    const first = click(200, 200, 900);
    const second = click(250, 250, 700);
    let next = appendRecordedAction(workflow, first, before.id);
    next = appendRecordedAction(next, second, actionIdForRecordedEvent(next, first.id));

    expect(next.actions.map((action) => action.id)).toEqual([
      before.id,
      first.id,
      second.id,
      after.id,
    ]);
  });

  it("merges a recorded double-click at the selected insertion point", () => {
    const workflow = emptyWorkflow();
    const before = createAction("wait");
    const after = createAction("text");
    workflow.actions = [before, after];
    const first = click(300, 220, 900);
    const second = click(302, 218, 180);

    let next = appendRecordedAction(workflow, first, before.id);
    next = appendRecordedAction(next, second, first.id);

    expect(next.actions).toHaveLength(3);
    expect(next.actions[1]).toMatchObject({
      id: first.id,
      name: "Double-click left button",
      params: { clickCount: 2 },
    });
    expect(actionIdForRecordedEvent(next, second.id)).toBe(first.id);
  });

  it("ignores the same recorder event delivered twice", () => {
    const action = click(420, 240, 300);
    let workflow = appendRecordedAction(emptyWorkflow(), action);
    workflow = appendRecordedAction(workflow, structuredClone(action));
    expect(workflow.actions).toHaveLength(1);
    expect(workflow.actions[0]).toMatchObject({
      id: action.id,
      name: "Click left button",
      params: { clickCount: 1 },
    });
  });

  it("ignores a duplicate delivery after its click was merged", () => {
    const first = click(420, 240, 900);
    const second = click(421, 241, 120);
    let workflow = appendRecordedAction(emptyWorkflow(), first);
    workflow = appendRecordedAction(workflow, second);
    workflow = appendRecordedAction(workflow, structuredClone(second));
    expect(workflow.actions).toHaveLength(1);
    expect(workflow.actions[0]).toMatchObject({
      name: "Double-click left button",
      params: { clickCount: 2 },
    });
  });

  it("repairs exact duplicate recorder rows already in a workflow", () => {
    const action = click(500, 400, 700);
    const workflow = emptyWorkflow();
    workflow.actions = [action, structuredClone(action)];
    expect(removeDuplicateRecordedEvents(workflow).actions).toEqual([action]);
  });
});
