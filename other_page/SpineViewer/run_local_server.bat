@echo off
cd /d "%~dp0"
echo Starting local server for Cocos build...
echo.
for %%P in (8080 8000 7457 7458 9000 3000) do (
  echo Trying http://localhost:%%P
  python -m http.server %%P
  if not errorlevel 1 goto :done
  echo.
)
echo Could not start a local server. Try running this file as administrator.
:done
pause
