import { describe, expect, it } from "vitest";
import type { RunState } from "../types/workflow";
import { primaryHotkeyIntent } from "./primaryHotkey";

describe("primaryHotkeyIntent", () => {
  it.each<RunState>(["idle", "completed", "failed", "cancelled"])(
    "starts a fresh run from %s",
    (state) => expect(primaryHotkeyIntent(state)).toBe("start"),
  );

  it.each<RunState>(["running", "waiting"])("pauses from %s", (state) =>
    expect(primaryHotkeyIntent(state)).toBe("pause"),
  );

  it("resumes a paused run", () => {
    expect(primaryHotkeyIntent("paused")).toBe("resume");
  });

  it.each<RunState>(["starting", "stopping"])("ignores a repeat press while %s", (state) =>
    expect(primaryHotkeyIntent(state)).toBe("ignore"),
  );
});
