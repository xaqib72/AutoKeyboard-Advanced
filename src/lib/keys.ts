export interface KeyGroup {
  label: string;
  keys: readonly string[];
}

const letters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
const numbers = Array.from({ length: 10 }, (_, index) => String(index));
const functionKeys = Array.from({ length: 24 }, (_, index) => `F${index + 1}`);
const numpadKeys = Array.from({ length: 10 }, (_, index) => `Numpad${index}`);

export const KEY_GROUPS: readonly KeyGroup[] = [
  { label: "Letters", keys: letters },
  { label: "Numbers", keys: numbers },
  { label: "Function keys", keys: functionKeys },
  {
    label: "Navigation and editing",
    keys: [
      "Enter",
      "Tab",
      "Escape",
      "Space",
      "Backspace",
      "Delete",
      "Insert",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "Left",
      "Right",
      "Up",
      "Down",
    ],
  },
  {
    label: "Modifiers and system",
    keys: [
      "Ctrl",
      "Alt",
      "Shift",
      "Win",
      "CapsLock",
      "NumLock",
      "ScrollLock",
      "PrintScreen",
      "Pause",
      "ContextMenu",
    ],
  },
  {
    label: "Numpad",
    keys: [...numpadKeys, "Add", "Subtract", "Multiply", "Divide", "Decimal"],
  },
  {
    label: "Media",
    keys: [
      "VolumeMute",
      "VolumeDown",
      "VolumeUp",
      "MediaPrevious",
      "MediaNext",
      "MediaStop",
      "MediaPlayPause",
    ],
  },
  { label: "Symbols", keys: ["`", "-", "=", "[", "]", "\\", ";", "'", ",", ".", "/"] },
] as const;

const codeNames: Record<string, string> = {
  Space: "Space",
  Escape: "Escape",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ControlLeft: "Ctrl",
  ControlRight: "Ctrl",
  AltLeft: "Alt",
  AltRight: "Alt",
  ShiftLeft: "Shift",
  ShiftRight: "Shift",
  MetaLeft: "Win",
  MetaRight: "Win",
  NumpadAdd: "Add",
  NumpadSubtract: "Subtract",
  NumpadMultiply: "Multiply",
  NumpadDivide: "Divide",
  NumpadDecimal: "Decimal",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

const keyNames: Record<string, string> = {
  Esc: "Escape",
  Escape: "Escape",
  Control: "Ctrl",
  Meta: "Win",
  OS: "Win",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  ArrowDown: "Down",
  " ": "Space",
  Apps: "ContextMenu",
  AudioVolumeMute: "VolumeMute",
  AudioVolumeDown: "VolumeDown",
  AudioVolumeUp: "VolumeUp",
  MediaTrackPrevious: "MediaPrevious",
  MediaTrackNext: "MediaNext",
  MediaPlayPause: "MediaPlayPause",
};

export function isModifierKey(event: KeyboardEvent): boolean {
  return ["Control", "Alt", "Shift", "Meta", "OS"].includes(event.key);
}

export function keyboardEventToChord(event: KeyboardEvent): string | undefined {
  let key = codeNames[event.code] ?? keyNames[event.key] ?? event.key;
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  else if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
  else if (/^Numpad[0-9]$/.test(event.code)) key = event.code;
  else if (key.length === 1 && /[a-z]/i.test(key)) key = key.toUpperCase();

  if (!key || key === "Dead" || key === "Unidentified") return undefined;

  const modifiers: string[] = [];
  if (event.ctrlKey && key !== "Ctrl") modifiers.push("Ctrl");
  if (event.altKey && key !== "Alt") modifiers.push("Alt");
  if (event.shiftKey && key !== "Shift") modifiers.push("Shift");
  if (event.metaKey && key !== "Win") modifiers.push("Win");
  return [...modifiers, key].join("+");
}
