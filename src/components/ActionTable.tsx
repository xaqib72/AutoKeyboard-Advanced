import { actionDetails, actionTypeLabel, pixelColor } from "../lib/format";
import type { ActionStateEvent, WorkflowAction } from "../types/workflow";

export function ActionTable({
  actions,
  selectedId,
  actionStates,
  onSelect,
  onEdit,
}: {
  actions: WorkflowAction[];
  selectedId?: string;
  actionStates: Record<string, ActionStateEvent["state"]>;
  onSelect: (id: string) => void;
  onEdit: (action: WorkflowAction) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="action-table">
        <thead>
          <tr>
            <th>Index</th>
            <th>Name</th>
            <th>Details</th>
            <th>Type</th>
            <th>Delay</th>
            <th>Generate</th>
            <th>Pixel Color</th>
            <th>Condition / Status</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action, index) => {
            const state = actionStates[action.id];
            return (
              <tr
                key={action.id}
                className={`${selectedId === action.id ? "selected" : ""} ${state ? `row-${state}` : ""} ${!action.enabled ? "disabled-row" : ""}`}
                aria-selected={selectedId === action.id}
                onClick={() => onSelect(action.id)}
                onDoubleClick={() => onEdit(action)}
              >
                <td>{index + 1}</td>
                <td>{action.name}</td>
                <td>{actionDetails(action)}</td>
                <td>{actionTypeLabel[action.type]}</td>
                <td className="number-cell">{action.delayAfterMs}</td>
                <td className="number-cell">{action.generate}</td>
                <td>{pixelColor(action)}</td>
                <td>{state ?? (action.guard ? "Guarded" : "")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {actions.length === 0 && (
        <div className="empty-table" onDoubleClick={() => undefined}>
          Add an action with the toolbar or Add menu.
        </div>
      )}
    </div>
  );
}
