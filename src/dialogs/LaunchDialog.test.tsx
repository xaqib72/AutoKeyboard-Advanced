// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LaunchDialog, type LaunchSettings } from "./LaunchDialog";

const initial: LaunchSettings = {
  mode: "hotkey",
  startHotkey: "F1",
  stopHotkey: "F2",
  delaySeconds: 5,
};

afterEach(cleanup);

describe("Launch dialog", () => {
  it("submits selected start and stop hotkeys", async () => {
    const onLaunch = vi.fn(async () => undefined);
    const view = render(
      <LaunchDialog initial={initial} onLaunch={onLaunch} onCancel={() => undefined} />,
    );
    fireEvent.change(view.getByLabelText("Automatic Hotkey:"), { target: { value: "F3" } });
    fireEvent.change(view.getByLabelText("Manual Hotkey:"), { target: { value: "F4" } });
    fireEvent.click(view.getByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(onLaunch).toHaveBeenCalledWith({
        mode: "hotkey",
        startHotkey: "F3",
        stopHotkey: "F4",
        delaySeconds: 5,
      }),
    );
  });

  it("allows one hotkey to toggle start and stop", () => {
    const view = render(
      <LaunchDialog initial={initial} onLaunch={vi.fn()} onCancel={() => undefined} />,
    );
    fireEvent.change(view.getByLabelText("Manual Hotkey:"), { target: { value: "F1" } });
    expect(view.getByText("The same key will toggle the workflow on and off.")).toBeTruthy();
  });
});
