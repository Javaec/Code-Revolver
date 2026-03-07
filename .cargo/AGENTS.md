# AGENTS.md

## Purpose
Local Cargo build-speed notes for this workspace.

## Goals
- Keep Rust iteration on Windows/MSVC reasonably fast.
- Prefer safe profile tuning before linker/toolchain changes.

## Why
- Tauri builds here are dominated by Rust compile/link time, especially repeated `cargo test` and `tauri build`.

## Constraints
- Do not assume `sccache`, `lld-link`, or custom toolchains are installed.
- Keep defaults compatible with the current `stable-x86_64-pc-windows-msvc` toolchain.

## Integration Points
- `src-tauri/Cargo.toml` profiles are the primary place for safe compile-speed tuning.
- Optional external accelerators should stay opt-in and documented, not hard-required.

## Current Decisions
- `dev` and `test` profiles use `debug = 0` to reduce PDB/debug-info overhead on Windows.
- `release` keeps optimization but enables incremental reuse for repeated local builds.
- Higher `codegen-units` in release is acceptable here to trade a bit of runtime optimality for faster iteration.

## Next Steps
- If `sccache` is installed locally, wire it through `.cargo/config.toml`.
- If a fast linker is available, evaluate `lld-link` for release builds on this machine.
