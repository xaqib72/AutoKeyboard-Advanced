import type { WorkflowAction } from "../types/workflow";
import { AdvancedActionDialog } from "./AdvancedActionDialog";
import { KeystrokeDialog } from "./KeystrokeDialog";
import { MouseDialog } from "./MouseDialog";
import { TextDialog } from "./TextDialog";
import { VariableDialog } from "./VariableDialog";

export function ActionDialog({
  action,
  actions,
  onSave,
  onCancel,
}: {
  action: WorkflowAction;
  actions: WorkflowAction[];
  onSave: (action: WorkflowAction) => void;
  onCancel: () => void;
}) {
  switch (action.type) {
    case "keyboard":
      return <KeystrokeDialog initial={action} onSave={onSave} onCancel={onCancel} />;
    case "mouse":
      return <MouseDialog initial={action} onSave={onSave} onCancel={onCancel} />;
    case "variable":
      return <VariableDialog initial={action} onSave={onSave} onCancel={onCancel} />;
    case "text":
      return <TextDialog initial={action} onSave={onSave} onCancel={onCancel} />;
    default:
      return (
        <AdvancedActionDialog
          initial={action}
          workflowActions={actions}
          onSave={onSave}
          onCancel={onCancel}
        />
      );
  }
}
