@echo off
title Autonomous Conflict Resolver Dashboard Launcher
echo =========================================================
echo  BUILDING PORTFOLIO PIECE: THE AUTONOMOUS CONFLICT RESOLVER
echo =========================================================
echo.
echo Step 1: Running automated integration tests to verify ADK ^& Agents...
python test_negotiation.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Test suite failed. Please verify Python installation.
    pause
    exit /b %errorlevel%
)
echo.
echo Step 2: Launching Flask ^& WebSockets Server on localhost:5000...
echo.
echo [INFO] Access the visualizer dashboard at: http://localhost:5000
echo [INFO] WebSockets broker running at: ws://localhost:5001
echo.
python server.py
pause
