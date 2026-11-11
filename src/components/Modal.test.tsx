// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

function TypingDialog() {
  const [text, setText] = useState("");
  return (
    <Modal title="Text" onCancel={vi.fn()} onSubmit={vi.fn()}>
      <textarea
        aria-label="Macro text"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    </Modal>
  );
}

describe("Modal focus", () => {
  it("keeps textarea focus while controlled content rerenders", () => {
    render(<TypingDialog />);
    const editor = screen.getByLabelText("Macro text");
    editor.focus();
    expect(document.activeElement).toBe(editor);
    fireEvent.change(editor, { target: { value: "continuous typing" } });
    expect(document.activeElement).toBe(editor);
    expect((editor as HTMLTextAreaElement).value).toBe("continuous typing");
  });
});
