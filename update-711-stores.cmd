@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo KD Coffee 7-ELEVEN nationwide store importer v3.2
echo.
where node >nul 2>nul || (
  echo Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)
call npm run update:711
set EXIT_CODE=%ERRORLEVEL%
echo.
if not "%EXIT_CODE%"=="0" (
  echo Update was not applied. The official store database remains unchanged.
) else (
  echo Update completed successfully.
)
pause
exit /b %EXIT_CODE%
