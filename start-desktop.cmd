@echo off
setlocal
cd /d "%~dp0"
set "NIKKE_DATA_DIR=%~dp0data"
node desktop-scripts/run.cjs start
exit /b %errorlevel%
