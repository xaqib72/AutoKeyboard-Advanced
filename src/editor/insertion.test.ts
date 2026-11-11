import { describe, expect, it } from "vitest";
import { createAction } from "./factories";
import { insertActionAfterSelection } from "./insertion";

describe("insertActionAfterSelection", () => {
  it("inserts immediately below the selected row", () => {
    const actions = [createAction("wait"), createAction("mouse"), createAction("text")];
    const inserted = createAction("keyboard");
    const next = insertActionAfterSelection(actions, inserted, actions[0]!.id);
    expect(next.map((action) => action.id)).toEqual([
      actions[0]!.id,
      inserted.id,
      actions[1]!.id,
      actions[2]!.id,
    ]);
    expect(actions).toHaveLength(3);
  });

  it("appends when there is no valid selection", () => {
    const actions = [createAction("wait"), createAction("mouse")];
    const inserted = createAction("text");
    expect(insertActionAfterSelection(actions, inserted).at(-1)?.id).toBe(inserted.id);
    expect(insertActionAfterSelection(actions, inserted, "missing").at(-1)?.id).toBe(inserted.id);
  });
});
