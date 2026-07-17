#!/bin/bash
cd /root/bsc-arbitrage-bot
echo "=== Arbitrage Monitor Status ==="
echo "Process: $(pgrep -f 'node monitor.js' | wc -l) running"
echo ""
echo "=== Last 5 log lines ==="
tail -5 monitor.log
echo ""
echo "=== Simulation Results ==="
cat simulation_results.json | python3 -m json.tool 2>/dev/null || cat simulation_results.json
echo ""
echo "=== Uptime ==="
ps -o etime= -p $(pgrep -f 'node monitor.js' | head -1) 2>/dev/null || echo "Not running"
