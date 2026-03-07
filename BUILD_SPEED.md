# Build Speed

Current safe defaults are configured in [src-tauri/Cargo.toml](/E:/Code-Revolver/src-tauri/Cargo.toml):

- `profile.dev.debug = 0`
- `profile.test.debug = 0`
- `profile.release.incremental = true`
- `profile.release.codegen-units = 64`

These changes mainly reduce Windows/MSVC debug symbol and relink overhead.

What helps even more, but is still optional:

1. Install `sccache` and set it as `RUSTC_WRAPPER`.
2. Try a faster linker such as `lld-link` if it is available on this machine.
3. Prefer `cargo check` during iteration and reserve full `cargo test` / `tauri build` for checkpoints.

Recommended local setup if `sccache` is installed:

```powershell
$env:RUSTC_WRAPPER="sccache"
```

Fast local build entry points:

- `build.cmd`
  Default fast path. Builds `debug` and passes `--no-bundle` to Tauri so you get a runnable binary faster.
- `build-release.cmd`
  Explicit release path. Builds the bundled release app.
- `build.cmd --release --no-bundle`
  Good checkpoint build when you want release Rust optimizations without waiting for installer packaging.
- `build.cmd --debug --verify`
  Fast binary build plus lint, if you want a little more confidence before testing.

Recommended sanity checks:

```powershell
cargo check
cargo test
npm run build
```
