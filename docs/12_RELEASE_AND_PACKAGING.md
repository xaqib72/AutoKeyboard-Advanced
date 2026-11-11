# 12 — Build, Release, Packaging

## 1. Windows output

Primary:
- signed installer

Also useful:
- portable build only if Tauri/runtime constraints permit it cleanly

## 2. Architectures

V1:
- x86_64 Windows

Future:
- ARM64 after native dependencies/sidecar pipeline tested

## 3. Sidecar packaging

If Python sidecar enabled:
- build sidecar executable for target architecture
- name according to Tauri external binary target requirements
- include only approved dependencies
- version handshake at startup

## 4. Build modes

### Lite build
No OCR, optional image matching worker if feasible.

### Full build
Image matching + OCR.

Do not create separate editions until the core product is stable; this is a packaging option, not an early product distraction.

## 5. Code signing

Automation utilities often trigger reputation/antivirus friction.

Production distribution should:
- sign executable/installer
- use stable publisher identity
- avoid packed/obfuscated binaries
- avoid self-modifying behavior
- keep updater signed

## 6. Update system

Phase after first stable build:
- signed update metadata
- update prompt
- rollback considerations

Never update while workflow is running.

## 7. Logs

Default:
- app logs in user app data
- redact typed text/clipboard/screenshots by default
- diagnostic mode explicitly enabled

## 8. Crash recovery

On abnormal exit:
- next launch checks autosave
- checks orphan runtime lock
- cleans stale temp screenshots
- starts in Idle state

## 9. Versioning

Semantic versioning:
- 0.x during development
- 1.0 when core + conditions + image matching + production persistence pass

Project schema version is independent of app version.
