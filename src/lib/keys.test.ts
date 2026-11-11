// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { keyboardEventToChord } from "./keys";

describe("keyboardEventToChord", () => {
  it("normalizes letters and modifiers", () => {
    expect(keyboardEventToChord(new KeyboardEvent("keydown", { key: "a", code: "KeyA" }))).toBe(
      "A",
    );
    expect(
      keyboardEventToChord(
        new KeyboardEvent("keydown", { key: "A", code: "KeyA", ctrlKey: true, shiftKey: true }),
      ),
    ).toBe("Ctrl+Shift+A");
  });

  it("normalizes navigation, numpad, and symbol keys", () => {
    expect(
      keyboardEventToChord(new KeyboardEvent("keydown", { key: "ArrowLeft", code: "ArrowLeft" })),
    ).toBe("Left");
    expect(keyboardEventToChord(new KeyboardEvent("keydown", { key: "1", code: "Numpad1" }))).toBe(
      "Numpad1",
    );
    expect(
      keyboardEventToChord(
        new KeyboardEvent("keydown", { key: "!", code: "Digit1", shiftKey: true }),
      ),
    ).toBe("Shift+1");
  });
});
