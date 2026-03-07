@echo off
call "%~dp0build.cmd" --release %*
exit /b %errorlevel%
