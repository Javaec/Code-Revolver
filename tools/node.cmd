@echo off
setlocal

if defined NODE_EXE if exist "%NODE_EXE%" set "_NODE_EXE=%NODE_EXE%"
if not defined _NODE_EXE if exist "C:\Program Files\nodejs\node.exe" set "_NODE_EXE=C:\Program Files\nodejs\node.exe"
if not defined _NODE_EXE if exist "C:\Program Files (x86)\nodejs\node.exe" set "_NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
if not defined _NODE_EXE if exist "%LocalAppData%\Programs\nodejs\node.exe" set "_NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
if not defined _NODE_EXE for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "_NODE_EXE=%%~$PATH:I"

if not defined _NODE_EXE (
  >&2 echo [tools\node.cmd] node.exe not found.
  >&2 echo [tools\node.cmd] Set NODE_EXE or install Node in a standard location.
  exit /b 9009
)

for %%I in ("%_NODE_EXE%") do set "_NODE_DIR=%%~dpI"
set "PATH=%_NODE_DIR%;%PATH%"

"%_NODE_EXE%" %*
exit /b %errorlevel%
