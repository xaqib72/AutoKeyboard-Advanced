# AutoKeyboard Advanced User Guide

## Create a workflow

Use the classic toolbar to add Keystroke, Mouse, Text, Variable, and Wait actions. Advanced contains conditions, branching, loops, labels, image matching, window actions, comments, and the input recorder. Double-click a row to edit it; drag rows or use Move Up/Down to reorder them. `Generate` repeats one action, `Delay` waits after it, and `Repeat Times` repeats the whole enabled workflow.

Use `${variableName}` in text and supported fields. Built-in values include `${run.repeatIndex}` and `${action.index}`. Variable actions can set, clear, append, increment, decrement, cast, zero-pad, and format integers in bases 2, 8, 10, or 16.

## Conditions and flow

Wait Until polls a pixel, window, image, variable, or composite condition until it matches or times out. A timeout can stop, skip, continue with a warning, or jump to a label. IF / ELSE / END IF and LOOP / END LOOP must be balanced; validation runs before save and before execution.

Mouse coordinates may target the virtual desktop, a window frame, or a window's client area. Window targets support title matching. Image actions use the selected template, confidence threshold, optional capture region, optional grayscale matching, and occurrence selection.

In a Mouse action, **Get Coordinate** minimizes AutoKeyboard and waits for the next left click anywhere on screen. The app then restores itself and fills X/Y. Press `Esc` while it is waiting to cancel.

For image conditions and Find Image + Click, enable **Search only within a selected screen area**. Enter X/Y/Width/Height manually or choose **Capture 4 corners on screen**; the app minimizes and records four corner clicks in any order. Their outer bounding box becomes that action's search rectangle, and image matching scans only inside it. Repeat this separately for every image action that needs its own area.

Find Image + Click can stop the workflow when its search times out, or jump directly to a selected instruction row if the image was not found.

## Run and recover safely

Start validates the workflow and runs it on the native scheduler. Pause stops active timing without consuming the remaining timeout. Stop cancels waits and releases held keys/buttons. The global emergency shortcut is `Ctrl+Alt+Shift+F12`.

Unsaved changes are periodically stored as a recovery snapshot. After an unexpected close, choose Recover to restore them or Discard to start clean. Save as `.akx` for a portable ZIP project containing workflow metadata and copied image assets, or `.akx.json` for readable JSON.

## Recorder

Choose Advanced → Record to capture keyboard chords and mouse clicks with elapsed timing. Press `Esc` or click Stop Recording to finish. Review captured rows before running them, especially when recording over sensitive applications.

Two clicks of the same mouse button within 500 ms and within 5 pixels are recorded as one double-click action. Slower or spatially separate clicks remain individual actions.

## Image matching

The packaged vision worker launches only on the first image condition/action and communicates over local JSON lines. No images are uploaded. Matching supports multiple monitors, regions, confidence thresholds, grayscale, occurrence selection, and cancellation. OCR is an optional roadmap feature and is not part of version 1.0.

## Local game shape slider

Use **Shape Slider** for a local game where a movable shape must be aligned with one of several cutouts. Capture a tight **Moving shape area** around the piece, then a **Candidate target area** around the possible matches. The vision worker compares their edges at 0°, 90°, 180°, and 270° so random quarter-turn rotations can still match.

Use **Get Slider Coordinates** to capture the thumb center at its starting position and again at the end of its horizontal travel. The app minimizes for these two clicks and fills in start X, end X, and Y. Set the slider start to correspond to the moving shape's position when the game round begins. The action moves the slider by the same horizontal offset as the detected target. Use a threshold around 0.45 to begin, then raise it if unrelated edges get selected or lower it if the same shape is rendered with different lighting. The game window and both captured areas must remain visible when this action runs.
