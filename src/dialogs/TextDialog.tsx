import { useState } from "react";
import type { TextAction } from "../types/workflow";
import { NumberInput } from "../components/Form";
import { Modal } from "../components/Modal";

export function TextDialog({
  initial,
  onSave,
  onCancel,
}: {
  initial: TextAction;
  onSave: (action: TextAction) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState(() => structuredClone(initial));
  const update = (patch: Partial<TextAction>) => setAction((value) => ({ ...value, ...patch }));
  return (
    <Modal title="Text" wide onCancel={onCancel} onSubmit={() => onSave(action)}>
      <textarea
        className="text-editor"
        value={action.params.text}
        wrap={action.params.wordWrap ? "soft" : "off"}
        onChange={(e) =>
          update({
            name: e.target.value.trim().slice(0, 32) || "Text",
            params: { ...action.params, text: e.target.value },
          })
        }
      />
      <div className="text-options">
        <fieldset className="radio-stack state-options">
          {(["none", "read", "replace"] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="state-mode"
                checked={action.params.stateMode === mode}
                onChange={() => update({ params: { ...action.params, stateMode: mode } })}
              />
              {mode.charAt(0).toUpperCase() + mode.slice(1)} state
            </label>
          ))}
        </fieldset>
        <div className="text-lower">
          <fieldset className="radio-stack">
            {(
              [
                ["clipboard", "Generate text via clipboard"],
                ["unicode", "Generate text via character message"],
                ["keystroke", "Physical keystrokes (recommended for emulators)"],
              ] as const
            ).map(([method, label]) => (
              <label key={method}>
                <input
                  type="radio"
                  name="text-method"
                  checked={action.params.method === method}
                  onChange={() => update({ params: { ...action.params, method } })}
                />
                {label}
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                checked={action.params.clearFirst ?? false}
                onChange={(e) =>
                  update({ params: { ...action.params, clearFirst: e.target.checked } })
                }
              />
              Clear target first
            </label>
            <label>
              <input
                type="checkbox"
                checked={action.params.wordWrap ?? false}
                onChange={(e) =>
                  update({ params: { ...action.params, wordWrap: e.target.checked } })
                }
              />
              Word wrap
            </label>
            <label className="line-iteration-option">
              <input
                type="checkbox"
                checked={action.params.linePerIteration ?? false}
                onChange={(e) =>
                  update({ params: { ...action.params, linePerIteration: e.target.checked } })
                }
              />
              One line per workflow iteration
              <small>Repeat 1 uses line 1, repeat 2 uses line 2, and so on.</small>
            </label>
          </fieldset>
          <fieldset>
            <label className="compact-label">
              Delay (in milliseconds):
              <NumberInput
                min={0}
                value={action.delayAfterMs}
                onChange={(e) => update({ delayAfterMs: Number(e.target.value) })}
              />
            </label>
            <label className="compact-label">
              Generate:
              <NumberInput
                min={1}
                value={action.generate}
                onChange={(e) => update({ generate: Number(e.target.value) })}
              />
            </label>
          </fieldset>
        </div>
      </div>
    </Modal>
  );
}
