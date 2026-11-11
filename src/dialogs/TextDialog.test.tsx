// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAction } from "../editor/factories";
import type { TextAction } from "../types/workflow";
import { TextDialog } from "./TextDialog";

describe("Text dialog", () => {
  it("saves one-line-per-iteration mode without changing normal text", () => {
    const onSave = vi.fn();
    render(
      <TextDialog
        initial={createAction("text") as TextAction}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "Ali\nSara\nUsman" } });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /One line per workflow iteration/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0]![0] as TextAction;
    expect(saved.params.text).toBe("Ali\nSara\nUsman");
    expect(saved.params.linePerIteration).toBe(true);
  });
});
