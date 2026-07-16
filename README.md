# BSC 套利机器人

BSC链上自动套利机器人，监控多个DEX价格差异，自动发现套利机会并执行交易。

## 特性

- **多DEX监控**: PancakeSwap V2/V3, Biswap, ApeSwap
- **自动套利**: 直接套利和三角套利策略
- **安全保护**: 支出限制、熔断机制、交易模拟、滑点保护
- **Flash Loan**: 支持闪电贷放大套利资金
- **MEV保护**: 支持私有RPC防止三明治攻击

## 安全警告

**这是一个高风险项目，涉及真实资金损失可能。**

- 使用专用热钱包，不要存放超过可承受损失的资金
- 先在测试网充分验证后再上主网
- 从小额开始（0.1 BNB），逐步增加
- 持续监控运行状态和盈亏
- 准备好紧急停止方案

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填入你的配置
```

### 3. 编译合约

```bash
npm run compile
```

### 4. 运行测试

```bash
npm test
```

### 5. 启动机器人

```bash
npm run dev
```

## 架构

```
src/
├── config/          # 配置管理
├── core/            # 套利引擎核心
├── dex/             # DEX连接器
├── strategies/      # 套利策略
├── security/        # 安全模块
├── utils/           # 工具函数
└── types/           # TypeScript类型
```

## 配置

### 必需环境变量

| 变量 | 说明 |
|------|------|
| `PRIVATE_KEY` | 热钱包私钥（无前缀0x） |
| `BSC_RPC_URL` | BSC RPC节点 |

### 可选环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PRIVATE_RPC_URL` | 私有RPC（MEV保护） | - |
| `MAX_SINGLE_TX_BNB` | 单笔最大BNB | 1.0 |
| `MAX_DAILY_SPEND_BNB` | 日限额BNB | 5.0 |
| `MAX_SLIPPAGE_BPS` | 最大滑点（基点） | 100 |
| `LOG_LEVEL` | 日志级别 | info |

## 文档

- [架构文档](docs/ARCHITECTURE.md)
- [安全文档](docs/SECURITY.md)
- [运维文档](docs/OPERATION.md)

## 许可证

MIT

## 组织

[BalanceAiCoding](https://github.com/BalanceAiCoding)
