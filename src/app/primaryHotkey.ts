import type { RunState } from "../types/workflow";

export type PrimaryHotkeyIntent = "start" | "pause" | "resume" | "ignore";

export function primaryHotkeyIntent(runState: RunState): PrimaryHotkeyIntent {
  switch (runState) {
    case "idle":
    case "completed":
    case "failed":
    case "cancelled":
      return "start";
    case "running":
    case "waiting":
      return "pause";
    case "paused":
      return "resume";
    case "starting":
    case "stopping":
      return "ignore";
  }
}
