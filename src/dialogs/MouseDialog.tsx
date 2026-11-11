import { useState } from "react";
import type { MouseAction } from "../types/workflow";
import { Field, NumberInput, Select, TimingFields } from "../components/Form";
import { Modal } from "../components/Modal";
import { orientSwipePoints } from "../editor/swipe";
import { backend, isTauri } from "../lib/tauri";

const clickOptions: Array<{
  label: string;
  button: MouseAction["params"]["button"];
  count: 1 | 2;
}> = [
  { label: "Click left button", button: "left", count: 1 },
  { label: "Click middle button", button: "middle", count: 1 },
  { label: "Click right button", button: "right", count: 1 },
  { label: "Double-click left button", button: "left", count: 2 },
  { label: "Double-click middle button", button: "middle", count: 2 },
  { label: "Double-click right button", button: "right", count: 2 },
];

const swipeDirections: Array<{
  value: MouseAction["params"]["swipeDirection"];
  label: string;
}> = [
  { value: "up", label: "Swipe Up" },
  { value: "down", label: "Swipe Down" },
  { value: "left", label: "Swipe Left" },
  { value: "right", label: "Swipe Right" },
];

const scrollDirections: Array<{
  value: MouseAction["params"]["scrollDirection"];
  label: string;
}> = [
  { value: "up", label: "Scroll Up" },
  { value: "down", label: "Scroll Down" },
];

function normalizeMouseAction(initial: MouseAction): MouseAction {
  return {
    ...structuredClone(initial),
    params: {
      ...structuredClone(initial.params),
      startX: initial.params.startX ?? initial.params.x ?? 700,
      startY: initial.params.startY ?? initial.params.y ?? 700,
      endX: initial.params.endX ?? initial.params.x ?? 700,
      endY: initial.params.endY ?? (initial.params.y ?? 600) - 300,
      swipeDirection: initial.params.swipeDirection ?? "up",
      swipeDurationMs: initial.params.swipeDurationMs ?? 500,
      scrollDirection: initial.params.scrollDirection ?? "down",
      scrollNotches: initial.params.scrollNotches ?? 3,
      scrollIntervalMs: initial.params.scrollIntervalMs ?? 30,
    },
  };
}

export function MouseDialog({
  initial,
  onSave,
  onCancel,
}: {
  initial: MouseAction;
  onSave: (action: MouseAction) => void;
  onCancel: () => void;
}) {
  const [action, setAction] = useState(() => normalizeMouseAction(initial));
  const [captureError, setCaptureError] = useState("");
  const update = (patch: Partial<MouseAction>) => setAction((value) => ({ ...value, ...patch }));
  const chooseClick = (button: MouseAction["params"]["button"], clickCount: 1 | 2, name: string) =>
    setAction((value) => ({
      ...value,
      name,
      params: { ...value.params, kind: "click", button, clickCount },
    }));
  const chooseSwipe = (direction: MouseAction["params"]["swipeDirection"]) =>
    setAction((value) => {
      const points = orientSwipePoints(value.params, direction);
      const label = swipeDirections.find((item) => item.value === direction)?.label ?? "Swipe";
      return {
        ...value,
        name: label,
        params: {
          ...value.params,
          ...points,
          kind: "swipe",
          button: "left",
          swipeDirection: direction,
        },
      };
    });
  const chooseScroll = (direction: MouseAction["params"]["scrollDirection"]) =>
    setAction((value) => ({
      ...value,
      name: direction === "up" ? "Scroll Up" : "Scroll Down",
      params: { ...value.params, kind: "scroll", scrollDirection: direction },
    }));

  const captureCoordinate = async () => {
    if (!isTauri()) {
      setCaptureError("Coordinate capture is available in the desktop app.");
      return;
    }
    try {
      const point = await backend.captureCoordinate();
      setAction((value) => ({ ...value, params: { ...value.params, ...point } }));
      setCaptureError("");
    } catch (error) {
      setCaptureError(String(error));
    }
  };

  const captureSwipe = async () => {
    if (!isTauri()) {
      setCaptureError("Swipe coordinate capture is available in the desktop app.");
      return;
    }
    try {
      const points = await backend.captureSwipePoints();
      setAction((value) => ({
        ...value,
        params: {
          ...value.params,
          ...orientSwipePoints(points, value.params.swipeDirection),
        },
      }));
      setCaptureError("");
    } catch (error) {
      setCaptureError(String(error));
    }
  };

  const swipe = action.params.kind === "swipe";
  return (
    <Modal title="Mouse" wide onCancel={onCancel} onSubmit={() => onSave(action)}>
      <fieldset className="radio-stack" aria-label="Mouse action">
        {clickOptions.map((option) => (
          <label key={option.label}>
            <input
              type="radio"
              name="mouse-kind"
              checked={
                action.params.kind === "click" &&
                action.params.button === option.button &&
                action.params.clickCount === option.count
              }
              onChange={() => chooseClick(option.button, option.count, option.label)}
            />
            {option.label}
          </label>
        ))}
        <label>
          <input
            type="radio"
            name="mouse-kind"
            checked={action.params.kind === "move"}
            onChange={() =>
              setAction((value) => ({
                ...value,
                name: "Move mouse",
                params: { ...value.params, kind: "move" },
              }))
            }
          />
          Move mouse only
        </label>

        <div className="swipe-direction-grid" role="radiogroup" aria-label="Swipe direction">
          {swipeDirections.map((direction) => (
            <label key={direction.value}>
              <input
                type="radio"
                name="mouse-kind"
                checked={
                  action.params.kind === "swipe" && action.params.swipeDirection === direction.value
                }
                onChange={() => chooseSwipe(direction.value)}
              />
              {direction.label}
            </label>
          ))}
        </div>

        <div className="scroll-direction-grid" role="radiogroup" aria-label="Scroll direction">
          {scrollDirections.map((direction) => (
            <label key={direction.value}>
              <input
                type="radio"
                name="mouse-kind"
                checked={
                  action.params.kind === "scroll" &&
                  action.params.scrollDirection === direction.value
                }
                onChange={() => chooseScroll(direction.value)}
              />
              {direction.label}
            </label>
          ))}
        </div>

        {swipe ? (
          <>
            <div className="swipe-coordinate-grid">
              <label>
                Start X:
                <NumberInput
                  aria-label="Swipe start X"
                  value={action.params.startX}
                  onChange={(event) =>
                    update({
                      params: { ...action.params, startX: Number(event.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Start Y:
                <NumberInput
                  aria-label="Swipe start Y"
                  value={action.params.startY}
                  onChange={(event) =>
                    update({
                      params: { ...action.params, startY: Number(event.target.value) },
                    })
                  }
                />
              </label>
              <label>
                End X:
                <NumberInput
                  aria-label="Swipe end X"
                  value={action.params.endX}
                  onChange={(event) =>
                    update({ params: { ...action.params, endX: Number(event.target.value) } })
                  }
                />
              </label>
              <label>
                End Y:
                <NumberInput
                  aria-label="Swipe end Y"
                  value={action.params.endY}
                  onChange={(event) =>
                    update({ params: { ...action.params, endY: Number(event.target.value) } })
                  }
                />
              </label>
              <button type="button" onClick={() => void captureSwipe()}>
                Get Start &amp; End
              </button>
            </div>
            <p className="field-hint">
              The app minimizes. Click the two swipe endpoints; the selected direction decides which
              one is Start. Press Esc to cancel.
            </p>
            <Field label="Swipe time (milliseconds):">
              <NumberInput
                aria-label="Swipe time"
                min={10}
                max={300000}
                value={action.params.swipeDurationMs}
                onChange={(event) =>
                  update({
                    params: {
                      ...action.params,
                      swipeDurationMs: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Swipe repeats:">
              <NumberInput
                aria-label="Swipe repeats"
                min={1}
                max={100000}
                value={action.generate}
                onChange={(event) => update({ generate: Number(event.target.value) })}
              />
            </Field>
            <Field label="Delay after swipes (milliseconds):">
              <NumberInput
                aria-label="Delay after swipes"
                min={0}
                value={action.delayAfterMs}
                onChange={(event) => update({ delayAfterMs: Number(event.target.value) })}
              />
            </Field>
          </>
        ) : action.params.kind === "scroll" ? (
          <>
            <div className="coordinate-grid">
              <label>
                X-Coordinate:
                <NumberInput
                  aria-label="Scroll X"
                  value={action.params.x}
                  onChange={(event) =>
                    update({ params: { ...action.params, x: Number(event.target.value) } })
                  }
                />
              </label>
              <label>
                Y-Coordinate:
                <NumberInput
                  aria-label="Scroll Y"
                  value={action.params.y}
                  onChange={(event) =>
                    update({ params: { ...action.params, y: Number(event.target.value) } })
                  }
                />
              </label>
              <button type="button" onClick={() => void captureCoordinate()}>
                Get Coordinate
              </button>
            </div>
            <p className="field-hint">
              Move the cursor to this point before sending normal mouse-wheel steps.
            </p>
            <Field label="Wheel steps:">
              <NumberInput
                aria-label="Wheel steps"
                min={1}
                max={10000}
                value={action.params.scrollNotches}
                onChange={(event) =>
                  update({
                    params: { ...action.params, scrollNotches: Number(event.target.value) },
                  })
                }
              />
            </Field>
            <Field label="Time between steps (milliseconds):">
              <NumberInput
                aria-label="Scroll interval"
                min={0}
                max={60000}
                value={action.params.scrollIntervalMs}
                onChange={(event) =>
                  update({
                    params: { ...action.params, scrollIntervalMs: Number(event.target.value) },
                  })
                }
              />
            </Field>
          </>
        ) : (
          <div className="coordinate-grid">
            <label>
              X-Coordinate:
              <NumberInput
                value={action.params.x}
                onChange={(event) =>
                  update({ params: { ...action.params, x: Number(event.target.value) } })
                }
              />
            </label>
            <label>
              Y-Coordinate:
              <NumberInput
                value={action.params.y}
                onChange={(event) =>
                  update({ params: { ...action.params, y: Number(event.target.value) } })
                }
              />
            </label>
            <button type="button" onClick={() => void captureCoordinate()}>
              Get Coordinate
            </button>
          </div>
        )}

        {captureError && <p className="inline-error">{captureError}</p>}
        <Field label="Coordinate space:">
          <Select
            value={action.params.coordinateSpace}
            onChange={(event) =>
              update({
                params: {
                  ...action.params,
                  coordinateSpace: event.target.value as MouseAction["params"]["coordinateSpace"],
                },
              })
            }
          >
            <option value="virtual_screen">Virtual screen</option>
            <option value="window_client">Window client</option>
            <option value="window_frame">Window frame</option>
          </Select>
        </Field>
        {(action.params.coordinateSpace === "window_client" ||
          action.params.coordinateSpace === "window_frame") && (
          <Field label="Window title contains:">
            <input
              value={action.params.targetWindow?.title ?? ""}
              onChange={(event) =>
                update({
                  params: {
                    ...action.params,
                    targetWindow: {
                      ...action.params.targetWindow,
                      title: event.target.value,
                      titleMatch: "contains",
                    },
                  },
                })
              }
            />
          </Field>
        )}
        {action.params.kind === "click" && (
          <Field label="After click:">
            <label>
              <input
                type="checkbox"
                checked={action.params.restoreCursor ?? false}
                onChange={(event) =>
                  update({
                    params: { ...action.params, restoreCursor: event.target.checked },
                  })
                }
              />{" "}
              Restore previous cursor position
            </label>
          </Field>
        )}
        {!swipe && (
          <TimingFields
            delay={action.delayAfterMs}
            generate={action.generate}
            onDelay={(delayAfterMs) => update({ delayAfterMs })}
            onGenerate={(generate) => update({ generate })}
          />
        )}
      </fieldset>
    </Modal>
  );
}
