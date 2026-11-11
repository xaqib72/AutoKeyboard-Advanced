import { useState } from "react";
import type { VariableAction } from "../types/workflow";
import { Field, NumberInput, Select, TimingFields } from "../components/Form";
import { Modal } from "../components/Modal";

export function VariableDialog({
  initial,
  onSave,
  onCancel,
}: {
  initial: VariableAction;
  onSave: (action: VariableAction) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState(() => structuredClone(initial));
  const update = (patch: Partial<VariableAction>) => setAction((value) => ({ ...value, ...patch }));
  return (
    <Modal
      title="Variable"
      onCancel={onCancel}
      onSubmit={() => action.params.variable.trim() && onSave(action)}
    >
      <fieldset>
        <Field label="Name:">
          <input
            value={action.params.variable}
            onChange={(e) =>
              update({
                name: `${action.params.operation} ${e.target.value}`,
                params: { ...action.params, variable: e.target.value },
              })
            }
          />
        </Field>
        <Field label="Operation:">
          <Select
            value={action.params.operation}
            onChange={(e) =>
              update({
                params: {
                  ...action.params,
                  operation: e.target.value as VariableAction["params"]["operation"],
                },
              })
            }
          >
            {["set", "increment", "decrement", "append", "clear", "cast"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </Select>
        </Field>
        <Field
          label={
            ["increment", "decrement"].includes(action.params.operation)
              ? "Initial value:"
              : "Value:"
          }
        >
          <input
            value={String(action.params.value)}
            onChange={(e) =>
              update({
                params: {
                  ...action.params,
                  value: /^-?\d+(\.\d+)?$/.test(e.target.value)
                    ? Number(e.target.value)
                    : e.target.value,
                },
              })
            }
          />
        </Field>
        <Field label="Typing method:">
          <Select
            value={action.params.typingMethod ?? "keystroke"}
            onChange={(e) =>
              update({
                params: {
                  ...action.params,
                  typingMethod: e.target.value as NonNullable<
                    VariableAction["params"]["typingMethod"]
                  >,
                },
              })
            }
          >
            <option value="keystroke">Physical keystrokes (emulator compatible)</option>
            <option value="clipboard">Clipboard</option>
            <option value="unicode">Unicode character input</option>
          </Select>
        </Field>
        <label className="line-iteration-option">
          <input
            type="checkbox"
            checked={action.params.clearFirst ?? false}
            onChange={(e) => update({ params: { ...action.params, clearFirst: e.target.checked } })}
          />
          Clear target field before typing
        </label>
        {["increment", "decrement"].includes(action.params.operation) && (
          <p className="dialog-hint">
            The current value is typed first, then the next value is saved for the following run.
          </p>
        )}
        <Field label="Increment:">
          <NumberInput
            value={action.params.increment}
            onChange={(e) =>
              update({ params: { ...action.params, increment: Number(e.target.value) } })
            }
          />
        </Field>
        <Field label="Min length:">
          <NumberInput
            min={0}
            value={action.params.minLength}
            onChange={(e) =>
              update({ params: { ...action.params, minLength: Number(e.target.value) } })
            }
          />
        </Field>
        <div className="radix-row">
          {[
            [2, "Bin"],
            [8, "Oct"],
            [10, "Dec"],
            [16, "Hex"],
          ].map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="radix"
                checked={action.params.radix === value}
                onChange={() =>
                  update({ params: { ...action.params, radix: value as 2 | 8 | 10 | 16 } })
                }
              />
              {label}
            </label>
          ))}
        </div>
        <TimingFields
          delay={action.delayAfterMs}
          generate={action.generate}
          onDelay={(delayAfterMs) => update({ delayAfterMs })}
          onGenerate={(generate) => update({ generate })}
        />
      </fieldset>
    </Modal>
  );
}
