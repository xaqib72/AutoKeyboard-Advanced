import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionType } from "../editor/factories";

interface MenuItem {
  label?: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}
interface Props {
  busy: boolean;
  selected: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onAdd: (type: ActionType) => void;
  onShow: (view: "shortcuts" | "diagnostics" | "about" | "logs") => void;
}

export function MenuBar(props: Props) {
  const [openMenu, setOpenMenu] = useState<string>();
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenMenu(undefined);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const menus: Array<{ label: string; items: MenuItem[] | ReactNode }> = [
    {
      label: "File",
      items: [
        { label: "New", shortcut: "Ctrl+N", action: props.onNew, disabled: props.busy },
        { label: "Open…", shortcut: "Ctrl+O", action: props.onOpen, disabled: props.busy },
        { label: "Save", shortcut: "Ctrl+S", action: props.onSave, disabled: props.busy },
        {
          label: "Save As…",
          shortcut: "Ctrl+Shift+S",
          action: props.onSaveAs,
          disabled: props.busy,
        },
        { separator: true },
        { label: "Exit", action: props.onExit },
      ],
    },
    {
      label: "Edit",
      items: [
        {
          label: "Undo",
          shortcut: "Ctrl+Z",
          action: props.onUndo,
          disabled: !props.canUndo || props.busy,
        },
        {
          label: "Redo",
          shortcut: "Ctrl+Y",
          action: props.onRedo,
          disabled: !props.canRedo || props.busy,
        },
        { separator: true },
        {
          label: "Edit Selected",
          shortcut: "Enter",
          action: props.onEdit,
          disabled: !props.selected || props.busy,
        },
        {
          label: "Duplicate",
          shortcut: "Ctrl+D",
          action: props.onDuplicate,
          disabled: !props.selected || props.busy,
        },
        {
          label: "Delete",
          shortcut: "Del",
          action: props.onDelete,
          disabled: !props.selected || props.busy,
        },
        {
          label: "Move Up",
          shortcut: "Ctrl+↑",
          action: () => props.onMove(-1),
          disabled: !props.selected || props.busy,
        },
        {
          label: "Move Down",
          shortcut: "Ctrl+↓",
          action: () => props.onMove(1),
          disabled: !props.selected || props.busy,
        },
      ],
    },
    {
      label: "Add",
      items: [
        ["keyboard", "Keystroke"],
        ["mouse", "Mouse"],
        ["variable", "Variable"],
        ["text", "Text"],
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
        ["comment", "Comment"],
      ].map(([type, label]) => ({
        label,
        action: () => props.onAdd(type as ActionType),
        disabled: props.busy,
      })),
    },
    { label: "Language", items: [{ label: "✓ English", disabled: false }] },
    {
      label: "Help",
      items: [
        { label: "Run Log", action: () => props.onShow("logs") },
        { label: "Keyboard Shortcuts", action: () => props.onShow("shortcuts") },
        { label: "Diagnostics", action: () => props.onShow("diagnostics") },
        { separator: true },
        { label: "About", action: () => props.onShow("about") },
      ],
    },
  ];
  return (
    <div className="menu-bar" ref={barRef} role="menubar">
      {menus.map((menu) => (
        <div className="menu-root" key={menu.label}>
          <button
            type="button"
            role="menuitem"
            aria-expanded={openMenu === menu.label}
            onClick={() => setOpenMenu(openMenu === menu.label ? undefined : menu.label)}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && Array.isArray(menu.items) && (
            <div className="menu-popup" role="menu">
              {menu.items.map((item, index) =>
                item.separator ? (
                  <hr key={index} />
                ) : (
                  <button
                    key={`${item.label}-${index}`}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      setOpenMenu(undefined);
                      item.action?.();
                    }}
                  >
                    <span>{item.label}</span>
                    <kbd>{item.shortcut}</kbd>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
