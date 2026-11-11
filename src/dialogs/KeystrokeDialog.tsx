import { useState } from "react";
import type { KeyboardAction } from "../types/workflow";
import { Field, NumberInput, Select, TimingFields } from "../components/Form";
import { Modal } from "../components/Modal";
import { KEY_GROUPS, keyboardEventToChord } from "../lib/keys";

export function KeystrokeDialog({
  initial,
  onSave,
  onCancel,
}: {
  initial: KeyboardAction;
  onSave: (action: KeyboardAction) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState(() => structuredClone(initial));
  const update = (patch: Partial<KeyboardAction>) => setAction((value) => ({ ...value, ...patch }));
  const setKeys = (keys: string) =>
    update({
      name: keys || "Keystroke",
      params: { ...action.params, keys },
    });
  return (
    <Modal
      title="Keystroke"
      onCancel={onCancel}
      onSubmit={() => action.params.keys.trim() && onSave(action)}
    >
      <fieldset>
        <Field label="Keystroke:">
          <div className="inline-field">
            <input
              value={action.params.keys}
              aria-label="Keystroke"
              placeholder="Press a key or type a chord"
              onChange={(e) => setKeys(e.target.value)}
              onKeyDown={(event) => {
                const keys = keyboardEventToChord(event.nativeEvent);
                if (!keys) return;
                event.preventDefault();
                event.stopPropagation();
                setKeys(keys);
              }}
            />
            <select
              className="key-picker"
              aria-label="Available keys"
              value=""
              title="Choose any keyboard key"
              onChange={(event) => setKeys(event.target.value)}
            >
              <option value="">Choose key…</option>
              {KEY_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.keys.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <small className="field-hint">
            Press a key/combo above, or choose a key from the list.
          </small>
        </Field>
        <Field label="Mode:">
          <Select
            value={action.params.mode}
            onChange={(e) =>
              update({
                params: {
                  ...action.params,
                  mode: e.target.value as KeyboardAction["params"]["mode"],
                },
              })
            }
          >
            <option value="press">Press</option>
            <option value="down">Key down</option>
            <option value="up">Key up</option>
          </Select>
        </Field>
        <Field label="Inter-repeat delay:">
          <NumberInput
            min={0}
            value={action.params.interRepeatDelayMs}
            onChange={(e) =>
              update({ params: { ...action.params, interRepeatDelayMs: Number(e.target.value) } })
            }
          />
        </Field>
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
