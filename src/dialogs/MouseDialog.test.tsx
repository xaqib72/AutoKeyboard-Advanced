// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAction } from "../editor/factories";
import type { MouseAction } from "../types/workflow";
import { MouseDialog } from "./MouseDialog";

const mocks = vi.hoisted(() => ({
  captureCoordinate: vi.fn(async () => ({ x: 320, y: 240 })),
  captureSwipePoints: vi.fn(async () => ({
    startX: 100,
    startY: 100,
    endX: 100,
    endY: 600,
  })),
}));

vi.mock("../lib/tauri", () => ({
  isTauri: () => true,
  backend: mocks,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Mouse dialog actions", () => {
  it("captures two endpoints, orients them, and saves duration and repeats", async () => {
    const onSave = vi.fn();
    render(
      <MouseDialog
        initial={createAction("mouse") as MouseAction}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Swipe Up" }));
    fireEvent.click(screen.getByRole("button", { name: "Get Start & End" }));
    expect(
      screen.getByText(/Click the two swipe endpoints; the selected direction decides/i),
    ).toBeTruthy();
    await waitFor(() => expect(mocks.captureSwipePoints).toHaveBeenCalledOnce());

    fireEvent.change(screen.getByLabelText("Swipe time"), { target: { value: "750" } });
    fireEvent.change(screen.getByLabelText("Swipe repeats"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0]![0] as MouseAction;
    expect(saved.name).toBe("Swipe Up");
    expect(saved.generate).toBe(3);
    expect(saved.params).toMatchObject({
      kind: "swipe",
      swipeDirection: "up",
      startX: 100,
      startY: 600,
      endX: 100,
      endY: 100,
      swipeDurationMs: 750,
    });
  });

  it("saves physical wheel direction, target, steps, interval, and repeats", async () => {
    const onSave = vi.fn();
    render(
      <MouseDialog
        initial={createAction("mouse") as MouseAction}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Scroll Down" }));
    fireEvent.click(screen.getByRole("button", { name: "Get Coordinate" }));
    await waitFor(() => expect(mocks.captureCoordinate).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText("Wheel steps"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Scroll interval"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Generate"), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    const saved = onSave.mock.calls[0]![0] as MouseAction;
    expect(saved.name).toBe("Scroll Down");
    expect(saved.generate).toBe(4);
    expect(saved.params).toMatchObject({
      kind: "scroll",
      scrollDirection: "down",
      scrollNotches: 7,
      scrollIntervalMs: 45,
      x: 320,
      y: 240,
    });
  });
});
