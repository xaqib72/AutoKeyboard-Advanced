# 14 — Repository and Code Style

## Suggested repository

```text
autokeyboard-advanced/
├── package.json
├── src/
│   ├── app/
│   ├── components/
│   ├── dialogs/
│   ├── editor/
│   ├── runtime-ui/
│   ├── styles/
│   ├── types/
│   └── lib/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   ├── engine/
│   │   ├── input/
│   │   ├── capture/
│   │   ├── windows/
│   │   ├── project/
│   │   ├── hotkeys/
│   │   ├── logging/
│   │   └── sidecar/
│   └── binaries/
├── vision-worker/
│   ├── pyproject.toml
│   ├── src/
│   ├── tests/
│   └── build/
├── schemas/
├── tests/
│   ├── fixtures/
│   └── harness/
└── docs/
```

## Rust rules

- typed errors; no stringly-typed error spaghetti
- no `unwrap()` in runtime paths unless logically impossible and justified
- cancellation explicit
- OS-specific code behind modules/traits
- engine should use provider traits so tests can fake input/capture

Interfaces:

```rust
trait InputProvider { ... }
trait CaptureProvider { ... }
trait ConditionProvider { ... }
trait Clock { ... }
```

## TypeScript rules

- strict mode
- no `any` for action payloads
- discriminated unions for action types
- forms validate before invoking Rust
- keep Tauri calls behind API wrapper

## Python rules

- typed functions
- structured JSON protocol
- stdout reserved for protocol
- logs to stderr
- no print debugging in production protocol path

## Dependency rule

Every dependency needs a purpose.

Avoid:
- giant UI framework
- multiple overlapping state libraries
- random automation libraries on top of Rust native core
