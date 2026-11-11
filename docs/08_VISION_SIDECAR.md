# 08 — Python Vision/OCR Sidecar

## 1. Principle

Python sidecar is optional and lazy.

Do not start it:
- at app launch
- for plain click/key/text workflows
- for pixel/window-only conditions if Rust handles them

Start it:
- first image-template action
- first OCR action

## 2. Packaging

Package as an executable sidecar.

Possible stack:
- Python 3.12+
- OpenCV
- NumPy
- optional OCR library chosen during implementation
- PyInstaller for production bundling

Do not expose a local HTTP server.

## 3. Protocol

JSON Lines.

Request:

```json
{
  "id": "uuid",
  "method": "match_template",
  "params": {
    "imagePath": "...",
    "templatePath": "...",
    "threshold": 0.9,
    "grayscale": false
  }
}
```

Response:

```json
{
  "id": "uuid",
  "ok": true,
  "result": {
    "found": true,
    "confidence": 0.96,
    "x": 100,
    "y": 200,
    "width": 80,
    "height": 30
  }
}
```

Error:

```json
{
  "id": "uuid",
  "ok": false,
  "error": {
    "code": "INVALID_IMAGE",
    "message": "..."
  }
}
```

## 4. Methods

Required:
- `ping`
- `match_template`

Optional V1:
- `ocr_region`

Debug:
- `version`

## 5. Template matching

V1:
- single best match
- normalized correlation method
- optional grayscale
- threshold
- return confidence and bounding box

Phase 2:
- multi-scale matching
- multiple matches
- non-max suppression

Do not overbuild initial CV.

## 6. OCR

OCR is behind a feature flag until:
- packaging size measured
- accuracy acceptable
- startup latency acceptable

If OCR increases installer massively, ship as optional component or separate edition later.

## 7. Sidecar lifecycle

Rust owns child process.

Rules:
- spawn once when needed
- read stdout continuously
- stderr -> diagnostics log
- request timeout
- if crashed: mark unavailable and optionally restart once
- kill child on app exit
- no orphan process

## 8. Temp files

Capture images:
- write into app runtime temp directory if file protocol used
- unique file names
- delete after request
- periodic cleanup after crash

Never put sensitive screenshots into project unless user explicitly saves them.

## 9. Performance budget

Image match target on ordinary small region:
- tens of milliseconds where feasible

The workflow poll interval, not raw detector speed, should control CPU.

No continuous full-screen CV loop at maximum speed.
