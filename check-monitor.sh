#!/bin/bash
# Check if monitor is running, restart if not
if ! pgrep -f "node monitor.js" > /dev/null; then
  cd /root/bsc-arbitrage-bot
  setsid ./run-monitor.sh &
  echo "$(date): Monitor restarted" >> monitor-check.log
fi
