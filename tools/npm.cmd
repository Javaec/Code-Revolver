@echo off
setlocal

if defined NODE_EXE if exist "%NODE_EXE%" set "_NODE_EXE=%NODE_EXE%"
if not defined _NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "_NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined _NODE_EXE if exist "C:\Program Files (x86)\nodejs\node.exe" set "_NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
if not defined _NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "_NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined _NODE_EXE for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "_NODE_EXE=%%~$PATH:I"

if not defined _NODE_EXE (
  >&2 echo [tools\npm.cmd] node.exe not found.
  >&2 echo [tools\npm.cmd] Set NODE_EXE or install Node in a standard location.
  exit /b 9009
)

for %%I in ("%_NODE_EXE%") do set "_NODE_DIR=%%~dpI"
set "PATH=%_NODE_DIR%;%PATH%"

if exist "%_NODE_DIR%npm.cmd" (
  call "%_NODE_DIR%npm.cmd" %*
  exit /b %errorlevel%
)

if defined NPM_CLI_JS if exist "%NPM_CLI_JS%" set "_NPM_CLI=%NPM_CLI_JS%"
if not defined _NPM_CLI if exist "%_NODE_DIR%node_modules\npm\bin\npm-cli.js" set "_NPM_CLI=%_NODE_DIR%node_modules\npm\bin\npm-cli.js"
if not defined _NPM_CLI if exist "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" set "_NPM_CLI=C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"
if not defined _NPM_CLI if exist "C:\Program Files (x86)\nodejs\node_modules\npm\bin\npm-cli.js" set "_NPM_CLI=C:\Program Files (x86)\nodejs\node_modules\npm\bin\npm-cli.js"
if not defined _NPM_CLI if exist "%LocalAppData%\Programs\nodejs\node_modules\npm\bin\npm-cli.js" set "_NPM_CLI=%LocalAppData%\Programs\nodejs\node_modules\npm\bin\npm-cli.js"

if not defined _NPM_CLI (
  >&2 echo [tools\npm.cmd] npm-cli.js not found.
  >&2 echo [tools\npm.cmd] Set NPM_CLI_JS to full path of npm-cli.js.
  exit /b 9009
)

"%_NODE_EXE%" "%_NPM_CLI%" %*
exit /b %errorlevel%
