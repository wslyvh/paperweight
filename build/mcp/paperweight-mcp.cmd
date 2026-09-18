@echo off
rem Writes need Electron's safeStorage to decrypt account credentials.
set ELECTRON_RUN_AS_NODE=
if exist "%~dp0app.asar" goto packaged

set "PAPERWEIGHT_ROOT=%~dp0..\.."
set "PAPERWEIGHT_EXECUTABLE=%PAPERWEIGHT_ROOT%\node_modules\electron\dist\electron.exe"
set PAPERWEIGHT_MCP=1
set "PAPERWEIGHT_RESOURCES_DIR=%PAPERWEIGHT_ROOT%\resources"
"%PAPERWEIGHT_EXECUTABLE%" %* "%PAPERWEIGHT_ROOT%"
goto :eof

:packaged
set "PAPERWEIGHT_EXECUTABLE=%~dp0..\Paperweight.exe"
set PAPERWEIGHT_MCP=1
"%PAPERWEIGHT_EXECUTABLE%" %*
