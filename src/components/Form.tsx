import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Field({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="form-row">
      <label htmlFor={htmlFor}>{label}</label>
      <div className="form-control">{children}</div>
    </div>
  );
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} />;
}

export function TimingFields({
  delay,
  generate,
  onDelay,
  onGenerate,
}: {
  delay: number;
  generate: number;
  onDelay: (value: number) => void;
  onGenerate: (value: number) => void;
}) {
  return (
    <>
      <Field label="Delay (in milliseconds):">
        <NumberInput
          aria-label="Delay"
          min={0}
          value={delay}
          onChange={(e) => onDelay(Number(e.target.value))}
        />
      </Field>
      <Field label="Generate:">
        <NumberInput
          aria-label="Generate"
          min={1}
          max={100000}
          value={generate}
          onChange={(e) => onGenerate(Number(e.target.value))}
        />
      </Field>
    </>
  );
}
