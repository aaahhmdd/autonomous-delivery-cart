@echo off
TITLE CARTA Vendor Portal
ECHO ==========================================
ECHO      CARTA AUTONOMOUS DELIVERY SYSTEM
ECHO           VENDOR DASHBOARD
ECHO ==========================================
ECHO.
ECHO Launching System...
ECHO.

:: Navigate to the folder where this script is located
cd /d "%~dp0"

:: Run the Streamlit App
streamlit run app.py

:: Keep window open if it crashes
PAUSE