import { ethers } from "ethers";

// Token 信息
export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  isStable: boolean;
}

// DEX 信息
export interface DEXInfo {
  name: string;
  router: string;
  factory: string;
  fee: number; // basis points (e.g., 25 = 0.25%)
}

// 价格信息
export interface PriceInfo {
  tokenIn: string;
  tokenOut: string;
  dex: string;
  price: bigint;
  timestamp: number;
}

// 套利机会
export interface ArbitrageOpportunity {
  tokenA: string;
  tokenB: string;
  buyDex: string;
  sellDex: string;
  buyPrice: bigint;
  sellPrice: bigint;
  profitBps: number; // basis points
  optimalAmount: bigint;
  expectedProfit: bigint;
  gasCost: bigint;
  netProfit: bigint;
  timestamp: number;
}

// DEX 连接器接口
export interface IDEXConnector {
  name: string;
  getPrice(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<bigint>;
  getAmountOut(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<bigint>;
  getReserves(tokenA: string, tokenB: string): Promise<[bigint, bigint]>;
}

// 安全守卫接口
export interface ISecurityGuard {
  check(opportunity: ArbitrageOpportunity): Promise<boolean>;
  recordExecution(result: ExecutionResult): void;
  isHalted(): boolean;
}

// 执行结果
export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  gasUsed?: bigint;
  actualProfit?: bigint;
  error?: string;
  timestamp: number;
}

// 交易参数
export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOutMin: bigint;
  deadline: number;
  dex: string;
}

// 套利路径
export interface ArbitragePath {
  tokenPath: string[];
  dexPath: string[];
  amounts: bigint[];
  expectedProfit: bigint;
}

// 日志级别
export type LogLevel = "debug" | "info" | "warn" | "error";

// 机器人状态
export type BotStatus = "running" | "paused" | "halted" | "error";

// 配置接口
export interface BotConfig {
  network: {
    chainId: number;
    rpcUrl: string;
    privateKey: string;
  };
  dexes: DEXInfo[];
  tokens: TokenInfo[];
  arbitrage: {
    minProfitBps: number;
    scanIntervalMs: number;
    gasPriceGwei: number;
    gasLimit: number;
    maxSlippageBps: number;
    deadlineMinutes: number;
  };
  security: {
    maxSingleTxBnb: number;
    maxDailySpendBnb: number;
    maxConsecutiveFailures: number;
    maxHourlyLossPct: number;
    maxDailyLossPct: number;
  };
}
