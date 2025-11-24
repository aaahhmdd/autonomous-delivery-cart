@echo off
TITLE Step 1: Install Python
ECHO ======================================================
ECHO      STEP 1: AUTOMATIC PYTHON INSTALLER
ECHO ======================================================

:: 1. Check if Python is already installed
python --version >nul 2>&1
IF %ERRORLEVEL% EQU 0 (
    ECHO [INFO] Python is already installed. You can skip this step.
    PAUSE
    EXIT /B
)

:: 2. Download Python (Using built-in Windows curl)
ECHO [INFO] Python not found. Downloading Python 3.11...
curl -o python_installer.exe https://www.python.org/ftp/python/3.11.5/python-3.11.5-amd64.exe

:: 3. Install Python Silently
:: /quiet = No UI
:: PrependPath=1 = Add to PATH (Crucial!)
ECHO [INFO] Installing Python. Please wait (this takes ~1-2 mins)...
start /wait python_installer.exe /quiet InstallAllUsers=1 PrependPath=1 Include_test=0

:: 4. Cleanup
del python_installer.exe

ECHO.
ECHO ======================================================
ECHO      SUCCESS! PYTHON INSTALLED.
ECHO ======================================================
ECHO [IMPORTANT] Please CLOSE this window before running the next script.
PAUSE