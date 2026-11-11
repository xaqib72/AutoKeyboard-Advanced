import type { MouseAction } from "../types/workflow";
import type { SwipePointsResult } from "../lib/tauri";

export function orientSwipePoints(
  points: SwipePointsResult,
  direction: MouseAction["params"]["swipeDirection"],
): SwipePointsResult {
  let start = { x: points.startX, y: points.startY };
  let end = { x: points.endX, y: points.endY };
  const shouldSwap =
    (direction === "up" && end.y > start.y) ||
    (direction === "down" && end.y < start.y) ||
    (direction === "left" && end.x > start.x) ||
    (direction === "right" && end.x < start.x);
  if (shouldSwap) [start, end] = [end, start];

  if ((direction === "up" || direction === "down") && start.y === end.y) {
    end.y = start.y + (direction === "up" ? -300 : 300);
  }
  if ((direction === "left" || direction === "right") && start.x === end.x) {
    end.x = start.x + (direction === "left" ? -300 : 300);
  }
  return { startX: start.x, startY: start.y, endX: end.x, endY: end.y };
}

export function swipeDirectionMatches(params: MouseAction["params"]): boolean {
  switch (params.swipeDirection) {
    case "up":
      return params.endY < params.startY;
    case "down":
      return params.endY > params.startY;
    case "left":
      return params.endX < params.startX;
    case "right":
      return params.endX > params.startX;
  }
}
