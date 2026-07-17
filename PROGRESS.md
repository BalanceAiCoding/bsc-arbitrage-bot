# BSC 套利机器人 - 7天监控进度

## 监控状态
- **启动时间**: 2026-07-17
- **目标时长**: 168小时 (7天)
- **扫描间隔**: 60秒
- **监控对**: 105个代币对
- **DEX数量**: 3个 (PancakeSwap, Biswap, ApeSwap)

## 当前结果
```bash
# 查看最新状态
tail -20 /root/bsc-arbitrage-bot/monitor.log
cat /root/bsc-arbitrage-bot/simulation_results.json
```

## 监控策略
1. **直接套利**: A→B 在 DEX1 买入，B→A 在 DEX2 卖出
2. **三角套利**: A→B→C→A 在同一DEX
3. **多跳跨DEX**: A→B (DEX1) → C (DEX2) → A (DEX3)

## 关键发现
- BSC主要代币对（WBNB/USDT等）市场极其高效
- 价差通常在0.1-0.5%，但往返滑点+手续费约0.5-0.7%
- 纯套利机会极少，需要寻找新币/小币种或极端市场波动

## 7天后评估标准
- 累计模拟利润 > 0.1 BNB: 考虑实盘
- 累计模拟利润 < 0.1 BNB: 策略需调整（增加新币扫描、降低 gas 阈值）
- 零机会: 市场过于高效，建议转向其他策略

## 进程管理
```bash
# 查看进程
pgrep -a -f "node monitor.js"

# 查看日志
tail -f /root/bsc-arbitrage-bot/monitor.log

# 查看结果
cat /root/bsc-arbitrage-bot/simulation_results.json

# 手动重启
pkill -f "run-monitor.sh"
cd /root/bsc-arbitrage-bot && setsid ./run-monitor.sh &
```
