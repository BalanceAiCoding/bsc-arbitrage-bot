import { ethers } from "ethers";
import { logger } from "./logger";

// BNB 主网 Gas 价格配置
const GAS_PRICE_CONFIG = {
  minGwei: 3,
  maxGwei: 20,
  defaultGwei: 5,
};

/**
 * 获取当前 Gas 价格
 */
export async function getGasPrice(provider: ethers.Provider): Promise<bigint> {
  try {
    const feeData = await provider.getFeeData();
    
    // 使用 EIP-1559 费用数据
    if (feeData.maxFeePerGas) {
      return feeData.maxFeePerGas;
    }
    
    // 回退到 legacy gasPrice
    if (feeData.gasPrice) {
      return feeData.gasPrice;
    }
    
    // 使用默认值
    return ethers.parseUnits(GAS_PRICE_CONFIG.defaultGwei.toString(), "gwei");
  } catch (error) {
    logger.warn("Failed to get gas price, using default", { error });
    return ethers.parseUnits(GAS_PRICE_CONFIG.defaultGwei.toString(), "gwei");
  }
}

/**
 * 估算交易 Gas 成本
 */
export async function estimateGasCost(
  provider: ethers.Provider,
  gasLimit: number = 300000
): Promise<bigint> {
  const gasPrice = await getGasPrice(provider);
  return gasPrice * BigInt(gasLimit);
}

/**
 * 计算 Gas 成本（以 BNB 为单位）
 */
export function gasCostToBnb(gasCost: bigint): number {
  return parseFloat(ethers.formatEther(gasCost));
}

/**
 * 检查 Gas 价格是否在合理范围内
 */
export function isGasPriceReasonable(gasPriceWei: bigint): boolean {
  const gasPriceGwei = parseFloat(ethers.formatUnits(gasPriceWei, "gwei"));
  return gasPriceGwei >= GAS_PRICE_CONFIG.minGwei && 
         gasPriceGwei <= GAS_PRICE_CONFIG.maxGwei;
}

/**
 * 获取推荐的 Gas 配置
 */
export async function getRecommendedGasConfig(provider: ethers.Provider): Promise<{
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}> {
  const feeData = await provider.getFeeData();
  
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    // EIP-1559
    return {
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    };
  }
  
  // Legacy
  return {
    gasPrice: feeData.gasPrice || ethers.parseUnits(GAS_PRICE_CONFIG.defaultGwei.toString(), "gwei"),
  };
}

/**
 * 计算交易的总成本（含 Gas）
 */
export function calculateTotalCost(
  amountIn: bigint,
  gasCost: bigint
): bigint {
  return amountIn + gasCost;
}

/**
 * 格式化 Gas 价格显示
 */
export function formatGasPrice(gasPriceWei: bigint): string {
  return `${ethers.formatUnits(gasPriceWei, "gwei")} Gwei`;
}
