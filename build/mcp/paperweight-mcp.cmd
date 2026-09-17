@echo off
if exist "%~dp0app.asar" goto packaged

set "PAPERWEIGHT_ROOT=%~dp0..\.."
set "PAPERWEIGHT_EXECUTABLE=%PAPERWEIGHT_ROOT%\node_modules\electron\dist\electron.exe"
set "MCP_ENTRYPOINT=%PAPERWEIGHT_ROOT%\out\main\mcp.js"
goto run

:packaged
set "PAPERWEIGHT_EXECUTABLE=%~dp0..\Paperweight.exe"
set "MCP_ENTRYPOINT=%~dp0app.asar\out\main\mcp.js"

:run
set ELECTRON_RUN_AS_NODE=1
"%PAPERWEIGHT_EXECUTABLE%" "%MCP_ENTRYPOINT%" %*
