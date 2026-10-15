@echo off
title DJ Tool server
cd /d "%~dp0"
echo Starting DJ Tool at http://localhost:5500/ ...
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:5500/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
echo.
echo Server stopped.
pause
