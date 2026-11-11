import { useState } from "react";
import { NumberInput, Select } from "../components/Form";
import { Modal } from "../components/Modal";

export type LaunchSettings =
  | { mode: "hotkey"; startHotkey: string; stopHotkey: string; delaySeconds: number }
  | { mode: "timer"; startHotkey: string; stopHotkey: string; delaySeconds: number };

const functionKeys = Array.from({ length: 24 }, (_, index) => `F${index + 1}`);
const letterKeys = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const numberKeys = Array.from({ length: 10 }, (_, index) => String(index));
const navigationKeys = [
  "Space",
  "Enter",
  "Tab",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Up",
  "Down",
  "Left",
  "Right",
];
const modifiedKeys = [
  ...functionKeys.slice(0, 12).map((key) => `Ctrl+${key}`),
  ...functionKeys.slice(0, 12).map((key) => `Alt+${key}`),
  ...functionKeys.slice(0, 12).map((key) => `Ctrl+Alt+${key}`),
  ...letterKeys.map((key) => `Ctrl+Alt+${key}`),
  ...letterKeys.map((key) => `Ctrl+Shift+${key}`),
];

function HotkeySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <optgroup label="Function keys">
        {functionKeys.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </optgroup>
      <optgroup label="Letters and numbers">
        {[...letterKeys, ...numberKeys].map((key) => (
          <option key={key}>{key}</option>
        ))}
      </optgroup>
      <optgroup label="Navigation keys">
        {navigationKeys.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </optgroup>
      <optgroup label="Key combinations">
        {modifiedKeys.map((key) => (
          <option key={key}>{key}</option>
        ))}
      </optgroup>
    </Select>
  );
}

export function LaunchDialog({
  initial,
  onLaunch,
  onCancel,
}: {
  initial: LaunchSettings;
  onLaunch: (settings: LaunchSettings) => Promise<void>;
  onCancel: () => void;
}) {
  const [settings, setSettings] = useState(() => structuredClone(initial));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onLaunch(settings);
    } catch (submitError) {
      setError(String(submitError));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="Launch"
      dialogClassName="launch-dialog"
      submitLabel={submitting ? "Starting…" : "Start"}
      onSubmit={() => void submit()}
      onCancel={onCancel}
    >
      <fieldset className="launch-options">
        <div className="launch-row">
          <label className="launch-mode">
            <input
              type="radio"
              name="launch-mode"
              checked={settings.mode === "hotkey"}
              onChange={() => setSettings({ ...settings, mode: "hotkey" })}
            />
            Using the Hotkey
          </label>
          <label>
            Automatic Hotkey:
            <HotkeySelect
              value={settings.startHotkey}
              onChange={(startHotkey) => setSettings({ ...settings, startHotkey })}
            />
          </label>
          <label>
            Manual Hotkey:
            <HotkeySelect
              value={settings.stopHotkey}
              onChange={(stopHotkey) => setSettings({ ...settings, stopHotkey })}
            />
          </label>
        </div>
        {settings.mode === "hotkey" && (
          <p className="launch-note">
            {settings.startHotkey === settings.stopHotkey
              ? "The same key will toggle the workflow on and off."
              : "Automatic starts, pauses, and resumes the workflow; Manual stops it."}
          </p>
        )}
        <div
          className={`launch-row launch-row--timer${settings.mode !== "timer" ? " disabled" : ""}`}
        >
          <label className="launch-mode">
            <input
              type="radio"
              name="launch-mode"
              checked={settings.mode === "timer"}
              onChange={() => setSettings({ ...settings, mode: "timer" })}
            />
            Using a Timer
          </label>
          <label>
            Delay (in seconds):
            <NumberInput
              min={1}
              max={86_400}
              disabled={settings.mode !== "timer"}
              value={settings.delaySeconds}
              onChange={(event) =>
                setSettings({ ...settings, delaySeconds: Math.max(1, Number(event.target.value)) })
              }
            />
          </label>
        </div>
      </fieldset>
      {error && <p className="inline-error">{error}</p>}
    </Modal>
  );
}
