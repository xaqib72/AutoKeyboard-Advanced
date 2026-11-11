import { describe, expect, it } from "vitest";
import { createAction } from "./factories";
import { orientSwipePoints, swipeDirectionMatches } from "./swipe";

describe("swipe coordinates", () => {
  it.each([
    ["up", { startX: 10, startY: 500, endX: 20, endY: 100 }],
    ["down", { startX: 20, startY: 100, endX: 10, endY: 500 }],
    ["left", { startX: 20, startY: 100, endX: 10, endY: 500 }],
    ["right", { startX: 10, startY: 500, endX: 20, endY: 100 }],
  ] as const)("orders captured points for %s", (direction, expected) => {
    expect(orientSwipePoints({ startX: 20, startY: 100, endX: 10, endY: 500 }, direction)).toEqual(
      expected,
    );
  });

  it("creates a useful primary-axis distance when both captured points align", () => {
    expect(orientSwipePoints({ startX: 50, startY: 90, endX: 50, endY: 90 }, "left")).toEqual({
      startX: 50,
      startY: 90,
      endX: -250,
      endY: 90,
    });
  });

  it("checks that manual coordinates agree with the selected direction", () => {
    const action = createAction("mouse");
    if (action.type !== "mouse") throw new Error("Unexpected action factory result");
    action.params.kind = "swipe";
    action.params.swipeDirection = "up";
    action.params.startY = 500;
    action.params.endY = 100;
    expect(swipeDirectionMatches(action.params)).toBe(true);
    action.params.endY = 700;
    expect(swipeDirectionMatches(action.params)).toBe(false);
  });
});
