@echo off
TITLE CARTA System Setup
ECHO ==========================================
ECHO      INSTALLING DEPENDENCIES...
ECHO ==========================================
ECHO.

:: Navigate to current folder
cd /d "%~dp0"

:: Install libraries
pip install -r requirements.txt

ECHO.
ECHO ==========================================
ECHO      SETUP COMPLETE!
ECHO ==========================================
ECHO You can now double-click "CARTA_Portal.bat" to start the app.
PAUSE