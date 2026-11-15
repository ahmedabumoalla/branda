@echo off
cd /d "%~dp0"
title Branda Finance Offline
"%~dp0node.exe" "%~dp0server.cjs"
if errorlevel 1 pause
