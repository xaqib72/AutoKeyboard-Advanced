import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSubmit?: () => void;
  wide?: boolean;
  submitLabel?: string;
  submitDisabled?: boolean;
  cancelLabel?: string;
  extraFooter?: ReactNode;
  dialogClassName?: string;
}

export function Modal({
  title,
  children,
  onCancel,
  onSubmit,
  wide,
  submitLabel = "OK",
  submitDisabled = false,
  cancelLabel = "Cancel",
  extraFooter,
  dialogClassName,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  const submitRef = useRef(onSubmit);
  cancelRef.current = onCancel;
  submitRef.current = onSubmit;
  useEffect(() => {
    const first = dialogRef.current?.querySelector<HTMLElement>("input, textarea, select, button");
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelRef.current();
      if (
        event.key === "Enter" &&
        submitRef.current &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        className={`classic-dialog${wide ? " classic-dialog--wide" : ""}${dialogClassName ? ` ${dialogClassName}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
      >
        <div className="dialog-titlebar">
          <span>{title}</span>
          <button type="button" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {(onSubmit || extraFooter) && (
          <div className="dialog-footer">
            {extraFooter}
            <span className="dialog-footer-spacer" />
            {onSubmit && (
              <button
                className="primary-button"
                type="button"
                disabled={submitDisabled}
                onClick={onSubmit}
              >
                {submitLabel}
              </button>
            )}
            <button type="button" onClick={onCancel}>
              {cancelLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
