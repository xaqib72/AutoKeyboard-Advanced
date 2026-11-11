// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAction } from "../editor/factories";
import type { JumpAction, WorkflowAction } from "../types/workflow";
import { AdvancedActionDialog } from "./AdvancedActionDialog";

afterEach(cleanup);

describe("Advanced action dialog", () => {
  it("edits a Jump using a one-based row number", () => {
    const onSave = vi.fn();
    const jump = createAction("jump") as JumpAction;
    const actions: WorkflowAction[] = [jump, createAction("text"), createAction("wait")];

    render(
      <AdvancedActionDialog
        initial={jump}
        workflowActions={actions}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Jump to row number:"), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    const saved = onSave.mock.calls[0]![0] as JumpAction;
    expect(saved.params.targetRow).toBe(3);
    expect(saved.params.label).toBeUndefined();
    expect(screen.getByText(/rows in between are skipped/i)).toBeTruthy();
  });

  it("converts a legacy label jump to its current row", () => {
    const onSave = vi.fn();
    const legacy = createAction("jump") as JumpAction;
    delete (legacy.params as Partial<JumpAction["params"]>).targetRow;
    legacy.params.label = "destination";
    const label = createAction("label");
    if (label.type !== "label") throw new Error("Unexpected action factory result");
    label.params.label = "destination";

    render(
      <AdvancedActionDialog
        initial={legacy}
        workflowActions={[legacy, createAction("text"), label]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    expect((screen.getByLabelText("Jump to row number:") as HTMLInputElement).value).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    const saved = onSave.mock.calls[0]![0] as JumpAction;
    expect(saved.params.targetRow).toBe(3);
    expect(saved.params.label).toBeUndefined();
  });

  it("offers an on-screen test for Find Image and Click", () => {
    const action = createAction("find_image_click");
    if (action.type !== "find_image_click") throw new Error("Unexpected action factory result");
    render(
      <AdvancedActionDialog
        initial={action}
        workflowActions={[action]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Test Image" })).toBeTruthy();
    expect(screen.getByText(/tightly cropped PNG/i)).toBeTruthy();
  });
});
