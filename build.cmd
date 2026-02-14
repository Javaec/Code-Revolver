@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
pushd "%ROOT_DIR%" >nul

set "BUILD_MODE=release"
set "INSTALL_MODE=auto"
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

set "TAURI_EXTRA_ARGS=%TAURI_EXTRA_ARGS% %~1"
shift
goto parse_args

:after_args
echo.
echo [build.cmd] Project: %ROOT_DIR%
echo [build.cmd] Mode: %BUILD_MODE%
echo [build.cmd] Install mode: %INSTALL_MODE%
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

echo [build.cmd] Running lint check
call "%ROOT_DIR%tools\npm.cmd" run lint
if errorlevel 1 goto fail

echo [build.cmd] Running TypeScript check
call "%ROOT_DIR%tools\node.cmd" "%ROOT_DIR%node_modules\typescript\bin\tsc" --noEmit
if errorlevel 1 goto fail

if /I "%BUILD_MODE%"=="debug" (
  echo [build.cmd] Building Tauri app (debug)
  call "%ROOT_DIR%tools\npm.cmd" run tauri build -- --debug%TAURI_EXTRA_ARGS%
) else (
  echo [build.cmd] Building Tauri app (release)
  call "%ROOT_DIR%tools\npm.cmd" run tauri build -- %TAURI_EXTRA_ARGS%
)
if errorlevel 1 goto fail

echo.
echo [build.cmd] Build completed successfully.
echo [build.cmd] Bundles: src-tauri\target\%BUILD_MODE%\bundle
echo.
popd >nul
exit /b 0

:usage
echo.
echo Usage:
echo   build.cmd [--debug^|--release] [--ci] [--no-install] [extra tauri build args]
echo.
echo Examples:
echo   build.cmd
echo   build.cmd --debug
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
