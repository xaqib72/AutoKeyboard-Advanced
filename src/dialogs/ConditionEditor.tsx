import type { ConditionExpression, PrimitiveCondition } from "../types/workflow";
import { Field, NumberInput, Select } from "../components/Form";

type PrimitiveKind = PrimitiveCondition["kind"];
export type ImageRegion = { x: number; y: number; width: number; height: number };

export function ImageRegionEditor({
  region,
  onChange,
  onSelect,
}: {
  region?: ImageRegion;
  onChange: (region?: ImageRegion) => void;
  onSelect?: () => void;
}) {
  const active = Boolean(region);
  const current = region ?? { x: 0, y: 0, width: 640, height: 480 };
  const patch = (changes: Partial<ImageRegion>) => onChange({ ...current, ...changes });
  return (
    <div className="image-region-card">
      <label className="region-toggle">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => onChange(event.target.checked ? current : undefined)}
        />
        Search only within a selected screen area
      </label>
      {active && (
        <>
          <div className="region-grid">
            <label>
              X
              <NumberInput
                value={current.x}
                onChange={(e) => patch({ x: Number(e.target.value) })}
              />
            </label>
            <label>
              Y
              <NumberInput
                value={current.y}
                onChange={(e) => patch({ y: Number(e.target.value) })}
              />
            </label>
            <label>
              Width
              <NumberInput
                min={1}
                value={current.width}
                onChange={(e) => patch({ width: Number(e.target.value) })}
              />
            </label>
            <label>
              Height
              <NumberInput
                min={1}
                value={current.height}
                onChange={(e) => patch({ height: Number(e.target.value) })}
              />
            </label>
          </div>
          {onSelect && (
            <button className="select-region-button" type="button" onClick={onSelect}>
              Capture 4 corners on screen
            </button>
          )}
          <small>
            App will minimize. Click all four corners of the search area in any order; the image
            search will use the box enclosing them. Esc cancels.
          </small>
        </>
      )}
    </div>
  );
}

function defaultCondition(kind: PrimitiveKind): PrimitiveCondition {
  switch (kind) {
    case "always":
      return { kind };
    case "never":
      return { kind };
    case "variable_compare":
      return { kind, variable: "var1", operator: "==", value: "" };
    case "pixel_match":
      return { kind, x: 0, y: 0, rgb: [0, 0, 0], tolerance: 0 };
    case "pixel_changed":
      return { kind, x: 0, y: 0, rgb: [0, 0, 0], tolerance: 0 };
    case "window_exists":
      return { kind, target: { title: "", titleMatch: "contains" } };
    case "window_active":
      return { kind, target: { title: "", titleMatch: "contains" } };
    case "image_present":
      return { kind, templateAsset: "", threshold: 0.9, grayscale: false };
    case "image_absent":
      return { kind, templateAsset: "", threshold: 0.9, grayscale: false };
  }
}

export function ConditionEditor({
  value,
  onChange,
  onCapturePixel,
  onBrowseImage,
  onSelectRegion,
}: {
  value: ConditionExpression;
  onChange: (value: ConditionExpression) => void;
  onCapturePixel?: () => void;
  onBrowseImage?: () => void;
  onSelectRegion?: () => void;
}) {
  if ("op" in value) {
    return (
      <div className="condition-composite">
        <p>
          This workflow contains a composite {value.op.toUpperCase()} condition. The compact editor
          preserves it; edit the JSON file to restructure complex groups.
        </p>
        <button type="button" onClick={() => onChange({ kind: "always" })}>
          Replace with simple condition
        </button>
      </div>
    );
  }
  const condition = value;
  const patch = (changes: Partial<PrimitiveCondition>) =>
    onChange({ ...condition, ...changes } as PrimitiveCondition);
  return (
    <div className="condition-editor">
      <Field label="Condition type:">
        <Select
          value={condition.kind}
          onChange={(e) => onChange(defaultCondition(e.target.value as PrimitiveKind))}
        >
          <option value="always">Always</option>
          <option value="never">Never</option>
          <option value="pixel_match">Pixel matches</option>
          <option value="pixel_changed">Pixel changes</option>
          <option value="window_exists">Window exists</option>
          <option value="window_active">Window is active</option>
          <option value="image_present">Image appears</option>
          <option value="image_absent">Image disappears</option>
          <option value="variable_compare">Variable comparison</option>
        </Select>
      </Field>
      {condition.kind === "variable_compare" && (
        <>
          <Field label="Variable:">
            <input
              value={condition.variable}
              onChange={(e) => patch({ variable: e.target.value })}
            />
          </Field>
          <Field label="Operator:">
            <Select
              value={condition.operator}
              onChange={(e) => patch({ operator: e.target.value as typeof condition.operator })}
            >
              {["==", "!=", ">", ">=", "<", "<=", "contains"].map((operator) => (
                <option key={operator}>{operator}</option>
              ))}
            </Select>
          </Field>
          <Field label="Expected value:">
            <input
              value={String(condition.value)}
              onChange={(e) => patch({ value: e.target.value })}
            />
          </Field>
        </>
      )}
      {(condition.kind === "pixel_match" || condition.kind === "pixel_changed") && (
        <>
          <div className="coordinate-grid">
            <label>
              X:
              <NumberInput
                value={condition.x}
                onChange={(e) => patch({ x: Number(e.target.value) })}
              />
            </label>
            <label>
              Y:
              <NumberInput
                value={condition.y}
                onChange={(e) => patch({ y: Number(e.target.value) })}
              />
            </label>
            <button type="button" onClick={onCapturePixel}>
              Get Pixel
            </button>
          </div>
          <Field label="Expected RGB:">
            <div className="rgb-fields">
              {condition.rgb.map((channel, index) => (
                <NumberInput
                  key={index}
                  min={0}
                  max={255}
                  value={channel}
                  onChange={(e) => {
                    const rgb = [...condition.rgb] as [number, number, number];
                    rgb[index] = Number(e.target.value);
                    patch({ rgb });
                  }}
                />
              ))}
              <span
                className="color-swatch"
                style={{ background: `rgb(${condition.rgb.join(",")})` }}
              />
            </div>
          </Field>
          <Field label="Tolerance:">
            <NumberInput
              min={0}
              max={255}
              value={condition.tolerance}
              onChange={(e) => patch({ tolerance: Number(e.target.value) })}
            />
          </Field>
        </>
      )}
      {(condition.kind === "window_exists" || condition.kind === "window_active") && (
        <>
          <Field label="Window title:">
            <input
              value={condition.target.title ?? ""}
              onChange={(e) => patch({ target: { ...condition.target, title: e.target.value } })}
            />
          </Field>
          <Field label="Title matching:">
            <Select
              value={condition.target.titleMatch ?? "contains"}
              onChange={(e) =>
                patch({
                  target: {
                    ...condition.target,
                    titleMatch: e.target.value as "contains" | "exact" | "regex",
                  },
                })
              }
            >
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
              <option value="regex">Regex</option>
            </Select>
          </Field>
          <Field label="Process name:">
            <input
              value={condition.target.process ?? ""}
              onChange={(e) => patch({ target: { ...condition.target, process: e.target.value } })}
            />
          </Field>
        </>
      )}
      {(condition.kind === "image_present" || condition.kind === "image_absent") && (
        <>
          <Field label="Template image:">
            <div className="inline-field">
              <input
                value={condition.templateAsset}
                onChange={(e) => patch({ templateAsset: e.target.value })}
              />
              <button type="button" onClick={onBrowseImage}>
                Browse…
              </button>
            </div>
          </Field>
          <p className="hint">
            Use a tightly cropped PNG with distinctive details. Capture it at the same Windows
            scaling and app/browser zoom used during automation.
          </p>
          <Field label="Similarity:">
            <NumberInput
              min={0.1}
              max={1}
              step={0.01}
              value={condition.threshold}
              onChange={(e) => patch({ threshold: Number(e.target.value) })}
            />
          </Field>
          <Field label="Options:">
            <label>
              <input
                type="checkbox"
                checked={condition.grayscale}
                onChange={(e) => patch({ grayscale: e.target.checked })}
              />{" "}
              Grayscale
            </label>
          </Field>
          <ImageRegionEditor
            region={condition.region}
            onChange={(region) => patch({ region })}
            onSelect={onSelectRegion}
          />
        </>
      )}
    </div>
  );
}
