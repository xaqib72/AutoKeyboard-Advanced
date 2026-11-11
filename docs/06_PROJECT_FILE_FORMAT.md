# 06 — Project File Format

## 1. Extension

Production:
- `.akx`

Development/debug:
- `.akx.json`

## 2. `.akx` container

ZIP layout:

```text
my-workflow.akx
├── manifest.json
├── workflow.json
├── assets/
│   └── images/
│       ├── img_01.png
│       └── img_02.png
└── metadata.json
```

## 3. Manifest

Example:

```json
{
  "format": "AutoKeyboardAdvanced",
  "schemaVersion": 1,
  "appVersion": "0.1.0",
  "createdAt": "2026-08-25T00:00:00Z",
  "modifiedAt": "2026-08-25T00:00:00Z"
}
```

## 4. Workflow

See `schemas/workflow.schema.json`.

Important:
- stable UUID action IDs
- rows/index are derived order
- unknown optional fields retained when possible
- migrations versioned

## 5. Asset IDs

Actions reference assets by logical ID/path, not arbitrary absolute disk paths.

Example:

```json
{
  "templateAsset": "assets/images/continue_button.png"
}
```

When importing an external image:
- copy into project asset directory/container
- normalize name
- compute hash
- retain original extension if supported

## 6. Save algorithm

1. validate editor state
2. serialize into temp location
3. write ZIP to `.tmp`
4. fsync/close
5. optionally backup old project
6. atomic replace where practical
7. clear dirty state

## 7. Autosave recovery

Autosave should not overwrite user's main file.

Recovery location:
- app data / autosave / project-hash

On crash/restart:
- detect newer autosave
- offer recover/discard

## 8. Legacy `.aki`

Treat as import-only.

Never claim full compatibility until a test corpus proves it.

Importer architecture:
- parser module isolated
- emits neutral internal action model
- unknown records produce warnings
- original file untouched

The provided legacy file should be retained in `reference/` as a sample, not used as a production dependency.
