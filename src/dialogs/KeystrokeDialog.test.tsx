// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAction } from "../editor/factories";
import type { KeyboardAction } from "../types/workflow";
import { KeystrokeDialog } from "./KeystrokeDialog";

describe("Keystroke dialog", () => {
  it("offers the full picker and captures a pressed chord", () => {
    render(
      <KeystrokeDialog
        initial={createAction("keyboard") as KeyboardAction}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Keystroke" }) as HTMLInputElement;
    const picker = screen.getByLabelText("Available keys") as HTMLSelectElement;

    fireEvent.change(picker, { target: { value: "Numpad7" } });
    expect(input.value).toBe("Numpad7");

    fireEvent.keyDown(input, { key: "a", code: "KeyA", ctrlKey: true });
    expect(input.value).toBe("Ctrl+A");
  });
});
