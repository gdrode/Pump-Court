@echo off
rem Double-click to build and launch Pump Court on Windows.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1" %*
if errorlevel 1 pause
