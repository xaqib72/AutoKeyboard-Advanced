import type { RunState, WorkflowAction } from "../types/workflow";
import type { ActionType } from "../editor/factories";
import { ToolbarIcon } from "./ToolbarIcon";

interface Props {
  selected: boolean;
  runState: RunState;
  recording: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onAdd: (type: ActionType) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onRunControl: () => void;
  onStop: () => void;
  onRecord: () => void;
}

function ToolButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tool-button"
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <ToolbarIcon kind={icon} />
      <span>{label}</span>
    </button>
  );
}

export function ClassicToolbar(props: Props) {
  const runBusy = !["idle", "completed", "failed", "cancelled"].includes(props.runState);
  const editLocked = runBusy || props.recording;
  const runLabel = props.runState === "paused" ? "Resume" : runBusy ? "Pause" : "Start";
  return (
    <>
      <div className="classic-toolbar" role="toolbar" aria-label="Main toolbar">
        <ToolButton label="New" icon="new" disabled={editLocked} onClick={props.onNew} />
        <ToolButton label="Open" icon="open" disabled={editLocked} onClick={props.onOpen} />
        <ToolButton label="Save" icon="save" disabled={editLocked} onClick={props.onSave} />
        <span className="tool-separator" />
        <ToolButton
          label="Keystroke"
          icon="keyboard"
          disabled={editLocked}
          onClick={() => props.onAdd("keyboard")}
        />
        <ToolButton
          label="Mouse"
          icon="mouse"
          disabled={editLocked}
          onClick={() => props.onAdd("mouse")}
        />
        <ToolButton
          label="Variable"
          icon="variable"
          disabled={editLocked}
          onClick={() => props.onAdd("variable")}
        />
        <ToolButton
          label="Text"
          icon="text"
          disabled={editLocked}
          onClick={() => props.onAdd("text")}
        />
        <span className="tool-separator" />
        <ToolButton
          label="Up"
          icon="up"
          disabled={!props.selected || editLocked}
          onClick={() => props.onMove(-1)}
        />
        <ToolButton
          label="Down"
          icon="down"
          disabled={!props.selected || editLocked}
          onClick={() => props.onMove(1)}
        />
        <ToolButton
          label="Delete"
          icon="delete"
          disabled={!props.selected || editLocked}
          onClick={props.onDelete}
        />
        <span className="tool-separator" />
        <ToolButton
          label={runLabel}
          icon={runBusy ? "pause" : "start"}
          disabled={
            props.recording || props.runState === "starting" || props.runState === "stopping"
          }
          onClick={props.onRunControl}
        />
        {runBusy && <ToolButton label="Stop" icon="stop" onClick={props.onStop} />}
      </div>
      <div className="advanced-toolbar" role="toolbar" aria-label="Advanced actions">
        <span>Advanced:</span>
        {(
          [
            ["wait", "Wait"],
            ["wait_condition", "Condition"],
            ["if", "If"],
            ["else", "Else"],
            ["end_if", "End If"],
            ["loop_start", "Loop"],
            ["loop_end", "End Loop"],
            ["label", "Label"],
            ["jump", "Jump"],
            ["window", "Window"],
            ["find_image_click", "Image Click"],
            ["comment", "Comment"],
          ] as Array<[WorkflowAction["type"], string]>
        ).map(([type, label]) => (
          <button type="button" key={type} disabled={editLocked} onClick={() => props.onAdd(type)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          className={props.recording ? "record-button recording" : "record-button"}
          disabled={runBusy}
          onClick={props.onRecord}
        >
          <span aria-hidden="true">●</span> {props.recording ? "Stop Recording" : "Record"}
        </button>
      </div>
    </>
  );
}
