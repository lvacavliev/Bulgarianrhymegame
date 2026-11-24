@echo off
rem Starts Rimoboy on a local web server and opens it in the browser.
rem Needs Python 3 (https://www.python.org/). Close this window to stop the server.
cd /d "%~dp0"
start "" http://127.0.0.1:8080/
python serve.py 8080
