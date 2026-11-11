import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ActionStateEvent,
  ConditionExpression,
  RunLogEntry,
  RunStateEvent,
  ValidationIssue,
  Workflow,
  WorkflowAction,
} from "../types/workflow";

export const isTauri = () => "__TAURI_INTERNALS__" in window;

export interface CoordinateResult {
  x: number;
  y: number;
}
export interface RegionResult extends CoordinateResult {
  width: number;
  height: number;
}
export interface SwipePointsResult {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}
export interface PixelResult extends CoordinateResult {
  rgb: [number, number, number];
  hex: string;
}
export interface ConditionTestResult {
  matched: boolean;
  elapsedMs: number;
  actual?: string;
  confidence?: number;
  x?: number;
  y?: number;
}

export const backend = {
  ping: () => invoke<string>("ping"),
  openProject: (path: string) => invoke<Workflow>("project_open", { path }),
  saveProject: (path: string, workflow: Workflow) =>
    invoke<void>("project_save", { path, workflow }),
  validate: (workflow: Workflow) => invoke<ValidationIssue[]>("project_validate", { workflow }),
  start: (workflow: Workflow) => invoke<string>("run_start", { workflow }),
  pause: () => invoke<void>("run_pause"),
  resume: () => invoke<void>("run_resume"),
  stop: () => invoke<void>("run_stop"),
  configureHotkeys: (startHotkey: string, stopHotkey: string) =>
    invoke<void>("hotkeys_configure", { startHotkey, stopHotkey }),
  recorderStart: () => invoke<void>("recorder_start"),
  recorderStop: () => invoke<void>("recorder_stop"),
  captureCoordinate: () => invoke<CoordinateResult>("capture_coordinate"),
  captureSwipePoints: () => invoke<SwipePointsResult>("capture_swipe_points"),
  captureRegion: () => invoke<RegionResult>("capture_region"),
  capturePixel: (x?: number, y?: number) => invoke<PixelResult>("capture_pixel", { x, y }),
  testCondition: (condition: ConditionExpression) =>
    invoke<ConditionTestResult>("condition_test", { condition }),
  diagnostics: () => invoke<Record<string, string>>("diagnostics_get"),
  onRunState: (handler: (event: RunStateEvent) => void): Promise<UnlistenFn> =>
    listen<RunStateEvent>("run_state", ({ payload }) => handler(payload)),
  onActionState: (handler: (event: ActionStateEvent) => void): Promise<UnlistenFn> =>
    listen<ActionStateEvent>("action_state", ({ payload }) => handler(payload)),
  onRunLog: (handler: (event: RunLogEntry) => void): Promise<UnlistenFn> =>
    listen<RunLogEntry>("run_log", ({ payload }) => handler(payload)),
  onGlobalStart: (handler: () => void): Promise<UnlistenFn> =>
    listen("global_start_requested", handler),
  onGlobalToggle: (handler: () => void): Promise<UnlistenFn> =>
    listen("global_toggle_requested", handler),
  onRecordedAction: (handler: (action: WorkflowAction) => void): Promise<UnlistenFn> =>
    listen<WorkflowAction>("recorder_action", ({ payload }) => handler(payload)),
  onRecorderState: (handler: (recording: boolean) => void): Promise<UnlistenFn> =>
    listen<{ recording: boolean }>("recorder_state", ({ payload }) => handler(payload.recording)),
};
