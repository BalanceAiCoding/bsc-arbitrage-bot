import { ethers } from "ethers";

/**
 * 计算恒定乘积做市商（CPMM）的交换输出
 * x * y = k
 */
export function calculateSwapOutput(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: number
): bigint {
  const feeMultiplier = 10000 - feeBps;
  const amountInWithFee = (amountIn * BigInt(feeMultiplier)) / BigInt(10000);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return numerator / denominator;
}

/**
 * 计算价格（tokenOut / tokenIn）
 */
export function calculatePrice(
  reserveIn: bigint,
  reserveOut: bigint,
  decimalsIn: number = 18,
  decimalsOut: number = 18
): number {
  const normalizedReserveIn = parseFloat(ethers.formatUnits(reserveIn, decimalsIn));
  const normalizedReserveOut = parseFloat(ethers.formatUnits(reserveOut, decimalsOut));
  return normalizedReserveOut / normalizedReserveIn;
}

/**
 * 计算价差（基点）
 */
export function calculatePriceDiffBps(
  price1: number,
  price2: number
): number {
  return Math.abs((price1 - price2) / Math.min(price1, price2)) * 10000;
}

/**
 * 计算套利利润（扣除手续费）
 */
export function calculateArbitrageProfit(
  amountIn: bigint,
  buyPrice: number,
  sellPrice: number,
  buyFeeBps: number,
  sellFeeBps: number,
  gasCost: bigint
): bigint {
  // 在低价 DEX 买入
  const amountAfterBuyFee = (amountIn * BigInt(10000 - buyFeeBps)) / BigInt(10000);
  const tokensBought = amountAfterBuyFee; // 简化计算，实际需要 reserve 数据

  // 在高价 DEX 卖出
  const amountAfterSellFee = (tokensBought * BigInt(10000 - sellFeeBps)) / BigInt(10000);
  
  // 利润 = 卖出金额 - 买入金额 - gas
  const profit = amountAfterSellFee - amountIn - gasCost;
  return profit;
}

/**
 * 计算最优套利金额
 */
export function calculateOptimalAmount(
  reserveIn1: bigint,
  reserveOut1: bigint,
  reserveIn2: bigint,
  reserveOut2: bigint,
  feeBps1: number,
  feeBps2: number
): bigint {
  // 简化版本：使用固定比例
  // 实际最优解需要求解二次方程
  const minReserve = reserveIn1 < reserveIn2 ? reserveIn1 : reserveIn2;
  return minReserve / BigInt(100); // 使用 1% 的流动性
}

/**
 * 将金额格式化为人类可读格式
 */
export function formatAmount(amount: bigint, decimals: number = 18): string {
  return ethers.formatUnits(amount, decimals);
}

/**
 * 解析人类可读金额为 BigNumber
 */
export function parseAmount(amount: string, decimals: number = 18): bigint {
  return ethers.parseUnits(amount, decimals);
}

/**
 * 计算滑点
 */
export function calculateSlippage(
  expectedAmount: bigint,
  actualAmount: bigint
): number {
  if (expectedAmount === BigInt(0)) return 0;
  const diff = expectedAmount > actualAmount ? expectedAmount - actualAmount : actualAmount - expectedAmount;
  return Number((diff * BigInt(10000)) / expectedAmount);
}

/**
 * 检查价格是否有效（非零、非无穷）
 */
export function isValidPrice(price: number): boolean {
  return price > 0 && isFinite(price) && !isNaN(price);
}

/**
 * 计算年化收益率（APR）
 */
export function calculateAPR(
  profit: bigint,
  capital: bigint,
  timeHours: number
): number {
  if (capital === BigInt(0) || timeHours <= 0) return 0;
  const profitRatio = Number(profit) / Number(capital);
  const periodsPerYear = (365 * 24) / timeHours;
  return profitRatio * periodsPerYear * 100;
}
