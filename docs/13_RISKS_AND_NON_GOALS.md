# 13 — Risks, Constraints, Non-Goals

## Technical risks

### Windows privilege/UIPI
Injected input can fail against higher-integrity targets.

Mitigation:
- detect/report
- document

### DPI/multi-monitor
Raw coordinates can drift.

Mitigation:
- DPI awareness
- coordinate spaces
- test matrix

### Image matching fragility
Templates break when theme/scale changes.

Mitigation:
- threshold
- region capture
- test tool
- optional multi-scale later

### OCR bloat
OCR can make installer and memory heavy.

Mitigation:
- optional feature
- lazy sidecar
- benchmark before V1 commitment

### Antivirus reputation
Macro/input software can be flagged.

Mitigation:
- transparent functionality
- signing
- no obfuscation
- minimal permissions
- no hidden persistence

### Infinite workflow
User can create loops that never exit.

Mitigation:
- global stop
- optional max iterations
- validation warnings

## Product risks

### Over-modernizing UI
User explicitly wants reference-like styling.

Mitigation:
- classic theme is locked
- screenshots are acceptance references

### Over-complicating editor
A node graph would destroy simplicity.

Mitigation:
- table-first workflow
- block markers for logic
- advanced fields in dialogs

## Non-goals V1

- browser extension
- cloud workflow execution
- mobile version
- remote bot farm
- captcha solving
- stealth/anti-detection features
- bypassing anti-fraud systems
- credential harvesting
- arbitrary PowerShell/shell/script execution
- process injection
- driver-level input
- kernel hooks
- automatic privilege escalation
- ad/reward impression manipulation
- service-specific account farming modules

## Privacy principles

- local-first
- no workflow upload by default
- screenshots temporary unless saved
- no telemetry containing typed text, clipboard, captured images, or target window content
