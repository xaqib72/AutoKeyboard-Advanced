import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ConditionExpression, WorkflowAction } from "../types/workflow";
import { Field, NumberInput, Select, TimingFields } from "../components/Form";
import { Modal } from "../components/Modal";
import { ConditionEditor, ImageRegionEditor } from "./ConditionEditor";
import { backend, isTauri } from "../lib/tauri";

type AdvancedAction = Exclude<WorkflowAction, { type: "keyboard" | "mouse" | "variable" | "text" }>;

export function AdvancedActionDialog({
  initial,
  workflowActions,
  onSave,
  onCancel,
}: {
  initial: AdvancedAction;
  workflowActions: WorkflowAction[];
  onSave: (action: AdvancedAction) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState(() => {
    const next = structuredClone(initial);
    if (next.type === "jump" && !Number.isInteger(next.params.targetRow)) {
      const legacyRow = workflowActions.findIndex(
        (candidate) => candidate.type === "label" && candidate.params.label === next.params.label,
      );
      next.params.targetRow = legacyRow >= 0 ? legacyRow + 1 : 1;
      delete next.params.label;
    }
    if (next.type === "find_image_click" && !next.params.onTimeout)
      next.params.onTimeout = { mode: "stop" };
    if (next.type === "solve_shape_slider" && !next.params.onFailure)
      next.params.onFailure = { mode: "reload_retry", retryDelayMs: 1200 };
    return next;
  });
  const [message, setMessage] = useState("");
  const update = (patch: Partial<AdvancedAction>) =>
    setAction((value) => ({ ...value, ...patch }) as AdvancedAction);
  const condition =
    action.type === "wait_condition" || action.type === "if"
      ? action.params.condition
      : action.type === "loop_start"
        ? action.params.condition
        : undefined;
  const updateCondition = (value: ConditionExpression) => {
    if (action.type === "wait_condition" || action.type === "if")
      update({ params: { ...action.params, condition: value } } as Partial<AdvancedAction>);
    if (action.type === "loop_start")
      update({ params: { ...action.params, condition: value } } as Partial<AdvancedAction>);
  };
  const capturePixel = async () => {
    if (!isTauri()) {
      setMessage("Pixel capture is available in the desktop app.");
      return;
    }
    const pixel = await backend.capturePixel();
    if (
      condition &&
      !("op" in condition) &&
      (condition.kind === "pixel_match" || condition.kind === "pixel_changed")
    )
      updateCondition({ ...condition, x: pixel.x, y: pixel.y, rgb: pixel.rgb });
  };
  const browseImage = async () => {
    if (!isTauri()) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp"] }],
    });
    if (
      selected &&
      condition &&
      !("op" in condition) &&
      (condition.kind === "image_present" || condition.kind === "image_absent")
    )
      updateCondition({ ...condition, templateAsset: selected });
  };
  const selectImageRegion = async () => {
    if (!isTauri()) {
      setMessage("Screen area selection is available in the desktop app.");
      return;
    }
    setMessage("Click all four corners of the search area. Press Esc to cancel.");
    try {
      const region = await backend.captureRegion();
      if (
        condition &&
        !("op" in condition) &&
        (condition.kind === "image_present" || condition.kind === "image_absent")
      ) {
        updateCondition({ ...condition, region });
      } else if (action.type === "find_image_click") {
        update({ params: { ...action.params, region } } as Partial<AdvancedAction>);
      }
      setMessage(
        `4-corner area selected: ${region.width} × ${region.height} at ${region.x}, ${region.y}`,
      );
    } catch (error) {
      setMessage(String(error));
    }
  };
  const selectPuzzleRegion = async (field: "sourceRegion" | "targetRegion") => {
    if (!isTauri()) {
      setMessage("Screen area selection is available in the desktop app.");
      return;
    }
    setMessage("Click all four corners of the selected game area. Press Esc to cancel.");
    try {
      const region = await backend.captureRegion();
      if (action.type === "solve_shape_slider") {
        update({ params: { ...action.params, [field]: region } } as Partial<AdvancedAction>);
        setMessage(`Selected ${region.width} × ${region.height} at ${region.x}, ${region.y}`);
      }
    } catch (error) {
      setMessage(String(error));
    }
  };
  const capturePuzzleSlider = async () => {
    if (!isTauri()) {
      setMessage("Slider coordinate capture is available in the desktop app.");
      return;
    }
    if (action.type !== "solve_shape_slider") return;
    setMessage("Click the slider thumb center at its start, then at its end. Press Esc to cancel.");
    try {
      const points = await backend.captureSwipePoints();
      if (Math.abs(points.startY - points.endY) > 12) {
        setMessage("Both slider points must be on the same horizontal track. Capture them again.");
        return;
      }
      update({
        params: {
          ...action.params,
          sliderStartX: points.startX,
          sliderEndX: points.endX,
          sliderY: points.startY,
        },
      } as Partial<AdvancedAction>);
      setMessage(`Captured slider: start X ${points.startX}, end X ${points.endX}, Y ${points.startY}`);
    } catch (error) {
      setMessage(String(error));
    }
  };
  const captureReloadPoint = async () => {
    if (!isTauri()) {
      setMessage("Reload coordinate capture is available in the desktop app.");
      return;
    }
    if (action.type !== "solve_shape_slider") return;
    setMessage("Click the center of the game's reload button. Press Esc to cancel.");
    try {
      const point = await backend.captureCoordinate();
      const delayMs = action.params.onFailure.mode === "reload_retry"
        ? action.params.onFailure.retryDelayMs
        : 1200;
      update({
        params: {
          ...action.params,
          onFailure: { mode: "reload_retry", reloadPoint: point, retryDelayMs: delayMs },
        },
      } as Partial<AdvancedAction>);
      setMessage(`Captured reload button at X=${point.x}, Y=${point.y}`);
    } catch (error) {
      setMessage(String(error));
    }
  };
  const testCondition = async () => {
    const testableCondition: ConditionExpression | undefined =
      condition ??
      (action.type === "find_image_click"
        ? {
            kind: "image_present",
            templateAsset: action.params.templateAsset,
            threshold: action.params.threshold,
            grayscale: action.params.grayscale,
            region: action.params.region,
          }
        : undefined);
    if (!testableCondition || !isTauri()) {
      setMessage("Condition testing is available in the desktop app.");
      return;
    }
    try {
      setMessage("Testing against the current screen…");
      const result = await backend.testCondition(testableCondition);
      const confidence =
        typeof result.confidence === "number"
          ? ` — ${(result.confidence * 100).toFixed(1)}% similarity`
          : "";
      const location =
        typeof result.x === "number" && typeof result.y === "number"
          ? ` at X=${result.x}, Y=${result.y}`
          : "";
      setMessage(
        `${result.matched ? "PASS" : "FAIL"} in ${result.elapsedMs} ms${confidence}${location}${result.actual ? ` — ${result.actual}` : ""}`,
      );
    } catch (error) {
      setMessage(String(error));
    }
  };

  return (
    <Modal
      title={action.name || "Action"}
      wide={action.type === "wait_condition" || action.type === "if"}
      onCancel={onCancel}
      onSubmit={() => onSave(action)}
      extraFooter={
        (condition || action.type === "find_image_click") && (
          <button type="button" onClick={() => void testCondition()}>
            {action.type === "find_image_click" ? "Test Image" : "Test Condition"}
          </button>
        )
      }
    >
      <fieldset>
        <Field label="Name:">
          <input value={action.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        {action.type === "wait" && (
          <Field label="Wait duration (ms):">
            <NumberInput
              min={0}
              value={action.params.durationMs}
              onChange={(e) =>
                update({
                  params: { durationMs: Number(e.target.value) },
                } as Partial<AdvancedAction>)
              }
            />
          </Field>
        )}
        {action.type === "comment" && (
          <Field label="Comment:">
            <textarea
              rows={4}
              value={action.params.text}
              onChange={(e) =>
                update({ params: { text: e.target.value } } as Partial<AdvancedAction>)
              }
            />
          </Field>
        )}
        {action.type === "label" && (
          <Field label="Label:">
            <input
              value={action.params.label}
              onChange={(e) =>
                update({ params: { label: e.target.value } } as Partial<AdvancedAction>)
              }
            />
          </Field>
        )}
        {action.type === "jump" && (
          <>
            <Field label="Jump to row number:" htmlFor="jump-target-row">
              <NumberInput
                id="jump-target-row"
                min={1}
                max={Math.max(workflowActions.length, 1)}
                value={action.params.targetRow}
                onChange={(e) => {
                  const params = {
                    ...action.params,
                    targetRow: Number(e.target.value),
                  };
                  delete params.label;
                  update({ params } as Partial<AdvancedAction>);
                }}
              />
            </Field>
            <p className="hint">
              Enter a row from 1 to {Math.max(workflowActions.length, 1)}. When this Jump runs,
              execution continues from that row and rows in between are skipped.
            </p>
          </>
        )}
        {action.type === "loop_start" && (
          <>
            <Field label="Loop mode:">
              <Select
                value={action.params.mode}
                onChange={(e) =>
                  update({
                    params: {
                      ...action.params,
                      mode: e.target.value as "count" | "while" | "until",
                      condition:
                        e.target.value === "count"
                          ? undefined
                          : (action.params.condition ?? { kind: "always" }),
                    },
                  } as Partial<AdvancedAction>)
                }
              >
                <option value="count">Repeat count</option>
                <option value="while">While condition</option>
                <option value="until">Until condition</option>
              </Select>
            </Field>
            {action.params.mode === "count" && (
              <Field label="Count:">
                <NumberInput
                  min={1}
                  value={action.params.count}
                  onChange={(e) =>
                    update({
                      params: { ...action.params, count: Number(e.target.value) },
                    } as Partial<AdvancedAction>)
                  }
                />
              </Field>
            )}
            <Field label="Safety max iterations:">
              <NumberInput
                min={1}
                value={action.params.maxIterations}
                onChange={(e) =>
                  update({
                    params: { ...action.params, maxIterations: Number(e.target.value) },
                  } as Partial<AdvancedAction>)
                }
              />
            </Field>
          </>
        )}
        {action.type === "window" && (
          <>
            <Field label="Operation:">
              <Select
                value={action.params.operation}
                onChange={(e) =>
                  update({
                    params: {
                      ...action.params,
                      operation: e.target.value as typeof action.params.operation,
                    },
                  } as Partial<AdvancedAction>)
                }
              >
                {["activate", "restore", "minimize", "wait_exists", "wait_active"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
            </Field>
            <Field label="Window title:">
              <input
                value={action.params.target.title ?? ""}
                onChange={(e) =>
                  update({
                    params: {
                      ...action.params,
                      target: { ...action.params.target, title: e.target.value },
                    },
                  } as Partial<AdvancedAction>)
                }
              />
            </Field>
            <Field label="Title matching:">
              <Select
                value={action.params.target.titleMatch ?? "contains"}
                onChange={(e) =>
                  update({
                    params: {
                      ...action.params,
                      target: {
                        ...action.params.target,
                        titleMatch: e.target.value as "contains" | "exact" | "regex",
                      },
                    },
                  } as Partial<AdvancedAction>)
                }
              >
                <option value="contains">Contains</option>
                <option value="exact">Exact</option>
                <option value="regex">Regular expression</option>
              </Select>
            </Field>
            <Field label="Process name:">
              <input
                placeholder="Example: notepad.exe"
                value={action.params.target.process ?? ""}
                onChange={(e) =>
                  update({
                    params: {
                      ...action.params,
                      target: { ...action.params.target, process: e.target.value },
                    },
                  } as Partial<AdvancedAction>)
                }
              />
            </Field>
          </>
        )}
        {action.type === "find_image_click" && (
          <>
            <Field label="Template image:">
              <div className="inline-field">
                <input
                  value={action.params.templateAsset}
                  onChange={(e) =>
                    update({
                      params: { ...action.params, templateAsset: e.target.value },
                    } as Partial<AdvancedAction>)
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      if (!isTauri()) return;
                      const path = await open({
                        multiple: false,
                        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp"] }],
                      });
                      if (path)
                        update({
                          params: { ...action.params, templateAsset: path },
                        } as Partial<AdvancedAction>);
                    })()
                  }
                >
                  Browse…
                </button>
              </div>
            </Field>
            <p className="hint">
              Best results: use a tightly cropped PNG with distinctive text, edges, or an icon.
              Avoid mouse-hover effects, animation, and large blank areas.
            </p>
            <Field label="Similarity:">
              <NumberInput
                min={0.1}
                max={1}
                step={0.01}
                value={action.params.threshold}
                onChange={(e) =>
                  update({
                    params: { ...action.params, threshold: Number(e.target.value) },
                  } as Partial<AdvancedAction>)
                }
              />
            </Field>
            <Field label="Grayscale match:">
              <label>
                <input
                  type="checkbox"
                  checked={action.params.grayscale}
                  onChange={(e) =>
                    update({
                      params: { ...action.params, grayscale: e.target.checked },
                    } as Partial<AdvancedAction>)
                  }
                />{" "}
                Ignore image colour
              </label>
            </Field>
            <Field label="Mouse button:">
              <Select
                value={action.params.button}
                onChange={(e) =>
                  update({
                    params: {
                      ...action.params,
                      button: e.target.value as typeof action.params.button,
                    },
                  } as Partial<AdvancedAction>)
                }
              >
                <option value="left">Left</option>
                <option value="middle">Middle</option>
                <option value="right">Right</option>
              </Select>
            </Field>
            <div className="coordinate-grid">
              <label>
                Click offset X:
                <NumberInput
                  value={action.params.offsetX}
                  onChange={(e) =>
                    update({
                      params: { ...action.params, offsetX: Number(e.target.value) },
                    } as Partial<AdvancedAction>)
                  }
                />
              </label>
              <label>
                Click offset Y:
                <NumberInput
                  value={action.params.offsetY}
                  onChange={(e) =>
                    update({
                      params: { ...action.params, offsetY: Number(e.target.value) },
                    } as Partial<AdvancedAction>)
                  }
                />
              </label>
            </div>
            <Field label="Timeout (ms):">
              <NumberInput
                min={0}
                value={action.params.timeoutMs}
                onChange={(e) =>
                  update({
                    params: { ...action.params, timeoutMs: Number(e.target.value) },
                  } as Partial<AdvancedAction>)
                }
              />
            </Field>
            <Field label="Poll every (ms):">
              <NumberInput
                min={50}
                value={action.params.pollIntervalMs}
                onChange={(e) =>
                  update({
                    params: { ...action.params, pollIntervalMs: Number(e.target.value) },
                  } as Partial<AdvancedAction>)
                }
              />
            </Field>
            <Field label="If image not found:">
              <Select
                value={action.params.onTimeout.mode}
                onChange={(e) =>
                  update({
                    params: {
                      ...action.params,
                      onTimeout:
                        e.target.value === "jump"
                          ? { mode: "jump", targetRow: 1 }
                          : { mode: "stop" },
                    },
                  } as Partial<AdvancedAction>)
                }
              >
                <option value="stop">Stop workflow</option>
                <option value="jump">Jump to instruction row</option>
              </Select>
            </Field>
            {action.params.onTimeout.mode === "jump" && (
              <Field label="Jump to row:">
                <NumberInput
                  min={1}
                  max={workflowActions.length}
                  value={action.params.onTimeout.targetRow}
                  onChange={(e) =>
                    update({
                      params: {
                        ...action.params,
                        onTimeout: { mode: "jump", targetRow: Number(e.target.value) },
                      },
                    } as Partial<AdvancedAction>)
                  }
                />
              </Field>
            )}
            <ImageRegionEditor
              region={action.params.region}
              onChange={(region) =>
                update({ params: { ...action.params, region } } as Partial<AdvancedAction>)
              }
              onSelect={() => void selectImageRegion()}
            />
          </>
        )}
        {action.type === "solve_shape_slider" && (
          <>
            <p className="hint">
              For your own local game: capture a tight rectangle around the moving shape and another
              around its candidate cutouts. Matching checks the shape in all four quarter-turns.
            </p>
            <ImageRegionEditor
              region={action.params.sourceRegion}
              label="Moving shape area"
              onChange={(region) => update({ params: { ...action.params, sourceRegion: region } } as Partial<AdvancedAction>)}
              onSelect={() => void selectPuzzleRegion("sourceRegion")}
            />
            <ImageRegionEditor
              region={action.params.targetRegion}
              label="Candidate target area"
              onChange={(region) => update({ params: { ...action.params, targetRegion: region } } as Partial<AdvancedAction>)}
              onSelect={() => void selectPuzzleRegion("targetRegion")}
            />
            <div className="coordinate-grid">
              <label>
                Slider start X
                <NumberInput
                  value={action.params.sliderStartX}
                  onChange={(e) => update({ params: { ...action.params, sliderStartX: Number(e.target.value) } } as Partial<AdvancedAction>)}
                />
              </label>
              <label>
                Slider end X
                <NumberInput
                  value={action.params.sliderEndX}
                  onChange={(e) => update({ params: { ...action.params, sliderEndX: Number(e.target.value) } } as Partial<AdvancedAction>)}
                />
              </label>
            </div>
            <button type="button" onClick={() => void capturePuzzleSlider()}>
              Get Slider Coordinates
            </button>
            <p className="hint">
              The app minimizes. Click the slider thumb center at its starting position, then at its end position.
            </p>
            <div className="coordinate-grid">
              <label>
                Slider Y
                <NumberInput
                  value={action.params.sliderY}
                  onChange={(e) => update({ params: { ...action.params, sliderY: Number(e.target.value) } } as Partial<AdvancedAction>)}
                />
              </label>
              <label>
                Shape similarity (0.1–1)
                <NumberInput
                  min={0.1}
                  max={1}
                  step={0.01}
                  value={action.params.threshold}
                  onChange={(e) => update({ params: { ...action.params, threshold: Number(e.target.value) } } as Partial<AdvancedAction>)}
                />
              </label>
            </div>
            <Field label="Slider drag duration (ms):">
              <NumberInput
                min={100}
                max={10000}
                value={action.params.dragDurationMs}
                onChange={(e) => update({ params: { ...action.params, dragDurationMs: Number(e.target.value) } } as Partial<AdvancedAction>)}
              />
            </Field>
            <label>
              If shape recognition fails
              <Select
                value={action.params.onFailure.mode}
                onChange={(event) => {
                  const mode = event.target.value;
                  const onFailure = action.params.onFailure;
                  update({
                    params: {
                      ...action.params,
                      onFailure:
                        mode === "jump"
                          ? {
                              mode: "jump",
                              targetRow:
                                onFailure.mode === "jump" ? onFailure.targetRow : 1,
                            }
                          : {
                              mode: "reload_retry",
                              reloadPoint:
                                onFailure.mode === "reload_retry"
                                  ? onFailure.reloadPoint
                                  : undefined,
                              retryDelayMs:
                                onFailure.mode === "reload_retry"
                                  ? onFailure.retryDelayMs
                                  : 1200,
                            },
                    },
                  } as Partial<AdvancedAction>);
                }}
              >
                <option value="jump">Jump to a row</option>
                <option value="reload_retry">Click reload and retry until recognized</option>
              </Select>
            </label>
            {action.params.onFailure.mode === "jump" ? (
              <Field label="Jump to row:">
                <NumberInput
                  min={1}
                  max={workflowActions.length}
                  value={action.params.onFailure.targetRow}
                  onChange={(event) =>
                    update({
                      params: {
                        ...action.params,
                        onFailure: {
                          ...action.params.onFailure,
                          targetRow: Number(event.target.value),
                        },
                      },
                    } as Partial<AdvancedAction>)}
                />
              </Field>
            ) : (
              <>
                <button type="button" onClick={() => void captureReloadPoint()}>
                  Get Reload Coordinates
                </button>
                <p className="hint">
                  {action.params.onFailure.reloadPoint
                    ? `Reload button: X=${action.params.onFailure.reloadPoint.x}, Y=${action.params.onFailure.reloadPoint.y}`
                    : "Capture the center of the game's reload button before running this workflow."}
                </p>
                <Field label="Wait after reload (ms):">
                  <NumberInput
                    min={100}
                    max={60000}
                    value={action.params.onFailure.retryDelayMs}
                    onChange={(event) =>
                      update({
                        params: {
                          ...action.params,
                          onFailure: {
                            ...action.params.onFailure,
                            retryDelayMs: Number(event.target.value),
                          },
                        },
                      } as Partial<AdvancedAction>)}
                  />
                </Field>
              </>
            )}
            <p className="hint">
              Reload mode keeps retrying until a shape is recognized. Use the emergency stop to end the workflow manually.
            </p>
          </>
        )}
        {condition && (
          <ConditionEditor
            value={condition}
            onChange={updateCondition}
            onCapturePixel={() => void capturePixel()}
            onBrowseImage={() => void browseImage()}
            onSelectRegion={() => void selectImageRegion()}
          />
        )}
        {action.type === "wait_condition" && (
          <>
            <Field label="Poll every (ms):">
              <NumberInput
                min={50}
                value={action.params.pollIntervalMs}
                onChange={(e) =>
                  update({
                    params: { ...action.params, pollIntervalMs: Number(e.target.value) },
                  } as Partial<AdvancedAction>)
                }
              />
            </Field>
            <Field label="Timeout (ms):">
              <NumberInput
                min={0}
                value={action.params.timeoutMs}
                onChange={(e) =>
                  update({
                    params: { ...action.params, timeoutMs: Number(e.target.value) },
                  } as Partial<AdvancedAction>)
                }
              />
            </Field>
            <Field label="On timeout:">
              <Select
                value={action.params.onTimeout.mode}
                onChange={(e) => {
                  const mode = e.target.value;
                  update({
                    params: {
                      ...action.params,
                      onTimeout:
                        mode === "jump"
                          ? { mode: "jump", label: "label1" }
                          : { mode: mode as "stop" | "skip" | "continue_warning" },
                    } as typeof action.params,
                  } as Partial<AdvancedAction>);
                }}
              >
                <option value="stop">Stop workflow</option>
                <option value="skip">Skip action</option>
                <option value="continue_warning">Continue with warning</option>
                <option value="jump">Jump to label</option>
              </Select>
            </Field>
            {action.params.onTimeout.mode === "jump" && (
              <Field label="Timeout label:">
                <input
                  value={action.params.onTimeout.label}
                  onChange={(event) =>
                    update({
                      params: {
                        ...action.params,
                        onTimeout: { mode: "jump", label: event.target.value },
                      },
                    } as Partial<AdvancedAction>)
                  }
                />
              </Field>
            )}
          </>
        )}
        {message && (
          <p className={message.startsWith("PASS") || message.startsWith("Captured") ? "inline-success" : "inline-error"}>
            {message}
          </p>
        )}
        {!(["else", "end_if", "loop_end", "break", "continue"] as string[]).includes(
          action.type,
        ) && (
          <TimingFields
            delay={action.delayAfterMs}
            generate={action.generate}
            onDelay={(delayAfterMs) => update({ delayAfterMs })}
            onGenerate={(generate) => update({ generate })}
          />
        )}
        {(["else", "end_if", "loop_end", "break", "continue"] as string[]).includes(
          action.type,
        ) && <p className="hint">This structural action has no additional settings.</p>}
      </fieldset>
    </Modal>
  );
}
