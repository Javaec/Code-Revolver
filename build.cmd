@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
pushd "%ROOT_DIR%" >nul

set "BUILD_MODE=debug"
set "INSTALL_MODE=auto"
set "VERIFY_MODE=skip"
set "BUNDLE_MODE=auto"
set "TAURI_EXTRA_ARGS="

:parse_args
if "%~1"=="" goto after_args
if /I "%~1"=="--help" goto usage
if /I "%~1"=="-h" goto usage
if /I "%~1"=="--debug" (
  set "BUILD_MODE=debug"
  shift
  goto parse_args
)
if /I "%~1"=="--release" (
  set "BUILD_MODE=release"
  shift
  goto parse_args
)
if /I "%~1"=="--ci" (
  set "INSTALL_MODE=ci"
  shift
  goto parse_args
)
if /I "%~1"=="--no-install" (
  set "INSTALL_MODE=skip"
  shift
  goto parse_args
)
if /I "%~1"=="--verify" (
  set "VERIFY_MODE=run"
  shift
  goto parse_args
)
if /I "%~1"=="--no-verify" (
  set "VERIFY_MODE=skip"
  shift
  goto parse_args
)
if /I "%~1"=="--bundle" (
  set "BUNDLE_MODE=force"
  shift
  goto parse_args
)
if /I "%~1"=="--no-bundle" (
  set "BUNDLE_MODE=skip"
  shift
  goto parse_args
)

set "TAURI_EXTRA_ARGS=%TAURI_EXTRA_ARGS% %~1"
shift
goto parse_args

:after_args
if /I "%BUILD_MODE%"=="release" if /I "%VERIFY_MODE%"=="skip" set "VERIFY_MODE=run"
if /I "%BUILD_MODE%"=="release" if /I "%BUNDLE_MODE%"=="auto" set "BUNDLE_MODE=force"
if /I "%BUILD_MODE%"=="debug" if /I "%BUNDLE_MODE%"=="auto" set "BUNDLE_MODE=skip"

echo.
echo [build.cmd] Project: %ROOT_DIR%
echo [build.cmd] Mode: %BUILD_MODE%
echo [build.cmd] Install mode: %INSTALL_MODE%
echo [build.cmd] Verify mode: %VERIFY_MODE%
echo [build.cmd] Bundle mode: %BUNDLE_MODE%
echo.

call "%ROOT_DIR%tools\npm.cmd" --version >nul 2>&1
if errorlevel 1 (
  echo [build.cmd] ERROR: npm/node was not found.
  echo [build.cmd] Install Node.js or set NODE_EXE, then try again.
  goto fail
)

cargo --version >nul 2>&1
if errorlevel 1 (
  echo [build.cmd] ERROR: cargo was not found.
  echo [build.cmd] Install Rust toolchain from https://rustup.rs/
  goto fail
)

if /I "%INSTALL_MODE%"=="ci" (
  echo [build.cmd] Running deterministic dependency install: npm ci
  call "%ROOT_DIR%tools\npm.cmd" ci
  if errorlevel 1 goto fail
) else if /I "%INSTALL_MODE%"=="auto" (
  if not exist "%ROOT_DIR%node_modules\" (
    echo [build.cmd] node_modules not found, running npm install
    call "%ROOT_DIR%tools\npm.cmd" install
    if errorlevel 1 goto fail
  ) else (
    echo [build.cmd] node_modules found, skipping install
  )
) else (
  echo [build.cmd] Dependency install skipped by --no-install
)

if /I "%VERIFY_MODE%"=="run" (
  echo [build.cmd] Running lint check
  call "%ROOT_DIR%tools\npm.cmd" run lint
  if errorlevel 1 goto fail
) else (
  echo [build.cmd] Verification skipped for faster local iteration
)

set "TAURI_BUILD_ARGS="
set "BUILD_LABEL=release"
set "BUILD_OUTPUT=src-tauri\target\release\bundle"

if /I "%BUILD_MODE%"=="debug" (
  set "TAURI_BUILD_ARGS= --debug"
  set "BUILD_LABEL=debug"
  set "BUILD_OUTPUT=src-tauri\target\debug\bundle"
) else (
  set "TAURI_BUILD_ARGS="
  set "BUILD_LABEL=release"
  set "BUILD_OUTPUT=src-tauri\target\release\bundle"
)

if /I "%BUNDLE_MODE%"=="skip" (
  set "TAURI_BUILD_ARGS=%TAURI_BUILD_ARGS% --no-bundle"
  if /I "%BUILD_MODE%"=="debug" (
    set "BUILD_OUTPUT=src-tauri\target\debug\code-revolver.exe"
  ) else (
    set "BUILD_OUTPUT=src-tauri\target\release\code-revolver.exe"
  )
)

echo [build.cmd] Building Tauri app (%BUILD_LABEL%)
call "%ROOT_DIR%tools\npm.cmd" run tauri build --%TAURI_BUILD_ARGS%%TAURI_EXTRA_ARGS%
if errorlevel 1 goto fail

echo.
echo [build.cmd] Build completed successfully.
if /I "%BUNDLE_MODE%"=="skip" (
  echo [build.cmd] Binary: %BUILD_OUTPUT%
) else (
  echo [build.cmd] Bundles: %BUILD_OUTPUT%
)
echo.
popd >nul
exit /b 0

:usage
echo.
echo Usage:
echo   build.cmd [--debug^|--release] [--verify^|--no-verify] [--bundle^|--no-bundle] [--ci] [--no-install] [extra tauri build args]
echo.
echo Defaults:
echo   build.cmd = fast local debug build without bundling
echo   build.cmd --release = verified release build with bundling
echo.
echo Examples:
echo   build.cmd
echo   build.cmd --debug
echo   build.cmd --release
echo   build.cmd --release --no-bundle
echo   build.cmd --debug --verify
echo   build.cmd --ci -- --bundles msi
echo.
popd >nul
exit /b 0

:fail
echo.
echo [build.cmd] Build failed.
echo.
popd >nul
exit /b 1
