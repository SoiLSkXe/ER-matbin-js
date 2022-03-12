@echo off
deno run --allow-read --allow-write "%~d0%~p0%~n0" %*
pause