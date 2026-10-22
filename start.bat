@echo off
setlocal enabledelayedexpansion
title Aladdin LMS
cd /d "%~dp0"

echo.
echo   ==================================================
echo      ALADDIN LMS
echo      Training platform
echo   ==================================================
echo.

rem Step 1: check Node.js
where node >nul 2>nul
if errorlevel 1 goto nonode

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if !NODEMAJOR! LSS 22 goto oldnode

rem Step 2: install dependencies once
if exist node_modules goto checkbuild

echo   [1/3] Installing components. This takes 1-2 minutes, please wait...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
echo.

:checkbuild
rem The site interface is built once (it is not stored in GitHub)
if exist build\index.html goto checkdb
echo   Building the site interface...
call npm run build
if errorlevel 1 goto failed
echo.

:checkdb
rem Step 3: create the database on first run
if exist data\aladdin.db goto run
echo   [2/3] Creating the demo database...
call npm run seed
if errorlevel 1 goto failed
echo.

:run
rem Step 4: start the server
echo   [3/3] Starting the server...
echo.
if "%PORT%"=="" set PORT=8080
node server\index.js

echo.
echo   The server has stopped.
pause
exit /b 0

:nonode
echo   Node.js is NOT installed.
echo.
echo   What to do:
echo     1. Open https://nodejs.org in your browser
echo     2. Click the big green LTS button, download and install it
echo        (click Next everywhere, no settings to change)
echo     3. RESTART your computer
echo     4. Double-click start.bat again
echo.
pause
exit /b 1

:oldnode
echo   Node.js is too old (version !NODEMAJOR! found).
echo.
echo   You need version 22.5 or newer.
echo   Install the current LTS version from https://nodejs.org
echo   and run this file again.
echo.
pause
exit /b 1

:failed
echo.
echo   Something went wrong. Please take a photo of this window
echo   and send it to the developer. Do not close the window.
echo.
pause
exit /b 1
