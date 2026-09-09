#!/bin/bash
set -eux
cd /app
export CONNECT_HEADLESS=0
export CONNECT_MAX_PER_RUN=2
export CONNECT_RESET_PROFILE=1
export ALLOW_AUTO_LOGIN=0

pkill Xvfb 2>/dev/null || true
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true
Xvfb :99 -screen 0 1365x900x24 -ac -nolisten tcp &
export DISPLAY=:99
sleep 2
echo "DISPLAY=$DISPLAY starting connect"
exec node run-connect-once.js
