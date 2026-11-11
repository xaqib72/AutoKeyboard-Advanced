import { describe, expect, it } from "vitest";
import { createAction, emptyWorkflow } from "./factories";
import { validateWorkflow } from "./validation";

describe("workflow validation", () => {
  it("accepts nested blocks", () => {
    const workflow = emptyWorkflow();
    workflow.actions = [
      createAction("if"),
      createAction("loop_start"),
      createAction("loop_end"),
      createAction("else"),
      createAction("end_if"),
    ];
    expect(validateWorkflow(workflow)).toEqual([]);
  });

  it("reports malformed blocks and invalid jump rows", () => {
    const workflow = emptyWorkflow();
    workflow.actions = [createAction("else"), createAction("loop_start"), createAction("jump")];
    const jump = workflow.actions[2]!;
    if (jump.type !== "jump") throw new Error("Unexpected action factory result");
    jump.params.targetRow = 4;
    expect(validateWorkflow(workflow).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["ORPHAN_ELSE", "UNCLOSED_LOOP", "INVALID_JUMP_ROW"]),
    );
  });

  it("accepts a one-based jump to an existing row", () => {
    const workflow = emptyWorkflow();
    const jump = createAction("jump");
    if (jump.type !== "jump") throw new Error("Unexpected action factory result");
    jump.params.targetRow = 3;
    workflow.actions = [jump, createAction("text"), createAction("wait")];
    expect(validateWorkflow(workflow)).toEqual([]);
  });

  it("handles a thousand valid rows", () => {
    const workflow = emptyWorkflow();
    workflow.actions = Array.from({ length: 1_000 }, () => createAction("wait"));
    expect(validateWorkflow(workflow)).toEqual([]);
  });

  it("rejects an empty image search region", () => {
    const workflow = emptyWorkflow();
    const action = createAction("find_image_click");
    if (action.type !== "find_image_click") throw new Error("Unexpected action factory result");
    action.params.templateAsset = "button.png";
    action.params.region = { x: 10, y: 20, width: 0, height: 80 };
    workflow.actions = [action];
    expect(validateWorkflow(workflow).map((issue) => issue.code)).toContain("INVALID_REGION");
  });

  it("rejects invalid image timing and similarity", () => {
    const workflow = emptyWorkflow();
    const action = createAction("find_image_click");
    if (action.type !== "find_image_click") throw new Error("Unexpected action factory result");
    action.params.templateAsset = "button.png";
    action.params.threshold = 1.2;
    action.params.pollIntervalMs = 10;
    workflow.actions = [action];
    expect(validateWorkflow(workflow).map((issue) => issue.code)).toContain("INVALID_IMAGE_SEARCH");
  });

  it("rejects zero loop counts and safety limits", () => {
    const workflow = emptyWorkflow();
    const loop = createAction("loop_start");
    if (loop.type !== "loop_start") throw new Error("Unexpected action factory result");
    loop.params.count = 0;
    loop.params.maxIterations = 0;
    workflow.actions = [loop, createAction("loop_end")];
    expect(validateWorkflow(workflow).map((issue) => issue.code)).toContain("INVALID_LOOP");
  });

  it("requires a usable window target", () => {
    const workflow = emptyWorkflow();
    const action = createAction("window");
    if (action.type !== "window") throw new Error("Unexpected action factory result");
    workflow.actions = [action];
    expect(validateWorkflow(workflow).map((issue) => issue.code)).toContain(
      "TARGET_WINDOW_MISSING",
    );
    action.params.target = { title: "[", titleMatch: "regex" };
    expect(validateWorkflow(workflow).map((issue) => issue.code)).toContain("INVALID_REGEX");
  });

  it("accepts a valid swipe and rejects invalid swipe geometry", () => {
    const workflow = emptyWorkflow();
    const swipe = createAction("mouse");
    if (swipe.type !== "mouse") throw new Error("Unexpected action factory result");
    swipe.params.kind = "swipe";
    swipe.params.swipeDirection = "up";
    swipe.params.startX = 400;
    swipe.params.startY = 700;
    swipe.params.endX = 400;
    swipe.params.endY = 200;
    swipe.params.swipeDurationMs = 750;
    workflow.actions = [swipe];
    expect(validateWorkflow(workflow)).toEqual([]);

    swipe.params.swipeDurationMs = 0;
    swipe.params.endY = 900;
    const codes = validateWorkflow(workflow).map((issue) => issue.code);
    expect(codes).toContain("INVALID_SWIPE");
    expect(codes).toContain("SWIPE_DIRECTION_MISMATCH");
  });

  it("validates mouse wheel scrolling", () => {
    const workflow = emptyWorkflow();
    const scroll = createAction("mouse");
    if (scroll.type !== "mouse") throw new Error("Unexpected action factory result");
    scroll.params.kind = "scroll";
    scroll.params.scrollDirection = "down";
    scroll.params.scrollNotches = 5;
    scroll.params.scrollIntervalMs = 25;
    workflow.actions = [scroll];
    expect(validateWorkflow(workflow)).toEqual([]);

    scroll.params.scrollNotches = 0;
    scroll.params.scrollIntervalMs = -1;
    expect(validateWorkflow(workflow).map((issue) => issue.code)).toContain("INVALID_SCROLL");
  });
});
