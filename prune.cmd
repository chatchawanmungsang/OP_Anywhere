@echo off
REM Use npm.cmd so PowerShell execution policy does not block npm.ps1
cd /d "%~dp0"
call npm.cmd run prune
exit /b %ERRORLEVEL%
