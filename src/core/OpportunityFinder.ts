import { ethers } from "ethers";
import { ArbitrageOpportunity, TokenInfo } from "../types";
import { PriceMonitor } from "./PriceMonitor";
import { DEXManager } from "../dex";
import { logger } from "../utils/logger";
import { calculatePriceDiffBps, isValidPrice, calculateOptimalAmount } from "../utils/priceUtils";
import { estimateGasCost } from "../utils/gasEstimator";
import { ARBITRAGE_CONFIG, DEX_CONFIG } from "../config";

/**
 * 套利机会发现器
 */
export class OpportunityFinder {
  private priceMonitor: PriceMonitor;
  private dexManager: DEXManager;
  private provider: ethers.Provider;

  constructor(
    priceMonitor: PriceMonitor,
    dexManager: DEXManager,
    provider: ethers.Provider
  ) {
    this.priceMonitor = priceMonitor;
    this.dexManager = dexManager;
    this.provider = provider;
  }

  /**
   * 扫描所有套利机会
   */
  async scanOpportunities(tokens: TokenInfo[]): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const dexNames = this.dexManager.getDEXNames();

    // 生成所有代币对
    const pairs = this.generateTokenPairs(tokens);

    for (const { tokenA, tokenB } of pairs) {
      // 获取所有 DEX 的价格
      const prices = await this.dexManager.getAllPrices(
        tokenA.address,
        tokenB.address,
        ethers.parseUnits("1", tokenA.decimals)
      );

      // 比较每对 DEX 的价格
      for (let i = 0; i < dexNames.length; i++) {
        for (let j = i + 1; j < dexNames.length; j++) {
          const dex1 = dexNames[i];
          const dex2 = dexNames[j];

          const price1 = prices.get(dex1);
          const price2 = prices.get(dex2);

          if (!price1 || !price2 || price1 === BigInt(0) || price2 === BigInt(0)) {
            continue;
          }

          // 确定买入和卖出 DEX
          let buyDex: string, sellDex: string;
          let buyPrice: bigint, sellPrice: bigint;

          if (price1 < price2) {
            buyDex = dex1;
            sellDex = dex2;
            buyPrice = price1;
            sellPrice = price2;
          } else {
            buyDex = dex2;
            sellDex = dex1;
            buyPrice = price2;
            sellPrice = price1;
          }

          // 计算价差（基点）
          const priceDiffBps = this.calculatePriceDifference(buyPrice, sellPrice);

          // 检查是否满足最小利润要求
          if (priceDiffBps < ARBITRAGE_CONFIG.minProfitBps) {
            continue;
          }

          // 计算最优套利金额和预期利润
          const opportunity = await this.calculateOpportunity(
            tokenA,
            tokenB,
            buyDex,
            sellDex,
            buyPrice,
            sellPrice,
            priceDiffBps
          );

          if (opportunity && opportunity.netProfit > BigInt(0)) {
            opportunities.push(opportunity);
          }
        }
      }
    }

    // 按利润排序
    opportunities.sort((a, b) => {
      if (a.netProfit > b.netProfit) return -1;
      if (a.netProfit < b.netProfit) return 1;
      return 0;
    });

    logger.info(`Scan complete`, { 
      opportunities: opportunities.length,
      bestProfit: opportunities.length > 0 ? ethers.formatEther(opportunities[0].netProfit) : "0"
    });

    return opportunities;
  }

  /**
   * 生成代币对组合
   */
  private generateTokenPairs(tokens: TokenInfo[]): Array<{ tokenA: TokenInfo; tokenB: TokenInfo }> {
    const pairs: Array<{ tokenA: TokenInfo; tokenB: TokenInfo }> = [];
    
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        pairs.push({ tokenA: tokens[i], tokenB: tokens[j] });
      }
    }
    
    return pairs;
  }

  /**
   * 计算价格差异（基点）
   */
  private calculatePriceDifference(
    buyPrice: bigint,
    sellPrice: bigint
  ): number {
    if (buyPrice === BigInt(0)) return 0;
    const diff = ((sellPrice - buyPrice) * BigInt(10000)) / buyPrice;
    return Number(diff);
  }

  /**
   * 计算套利机会详情
   */
  private async calculateOpportunity(
    tokenA: TokenInfo,
    tokenB: TokenInfo,
    buyDex: string,
    sellDex: string,
    buyPrice: bigint,
    sellPrice: bigint,
    profitBps: number
  ): Promise<ArbitrageOpportunity | null> {
    try {
      // 估算 Gas 成本
      const gasCost = await estimateGasCost(this.provider, ARBITRAGE_CONFIG.gasLimit);

      // 计算最优套利金额（简化版：使用固定金额）
      const optimalAmount = ethers.parseUnits("0.1", tokenA.decimals); // 从 0.1 开始

      // 获取买入和卖出的输出金额
      const buyDexConnector = this.dexManager.getDEX(buyDex);
      const sellDexConnector = this.dexManager.getDEX(sellDex);

      if (!buyDexConnector || !sellDexConnector) {
        return null;
      }

      const amountOutBuy = await buyDexConnector.getAmountOut(
        tokenA.address,
        tokenB.address,
        optimalAmount
      );

      const amountOutSell = await sellDexConnector.getAmountOut(
        tokenB.address,
        tokenA.address,
        amountOutBuy
      );

      // 计算预期利润
      const expectedProfit = amountOutSell > optimalAmount ? amountOutSell - optimalAmount : BigInt(0);
      const netProfit = expectedProfit > gasCost ? expectedProfit - gasCost : BigInt(0);

      if (netProfit <= BigInt(0)) {
        return null;
      }

      return {
        tokenA: tokenA.address,
        tokenB: tokenB.address,
        buyDex,
        sellDex,
        buyPrice,
        sellPrice,
        profitBps,
        optimalAmount,
        expectedProfit,
        gasCost,
        netProfit,
        timestamp: Date.now(),
      };
    } catch (error) {
      logger.error("Failed to calculate opportunity", {
        tokenA: tokenA.symbol,
        tokenB: tokenB.symbol,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * 获取最优套利机会
   */
  async getBestOpportunity(tokens: TokenInfo[]): Promise<ArbitrageOpportunity | null> {
    const opportunities = await this.scanOpportunities(tokens);
    return opportunities.length > 0 ? opportunities[0] : null;
  }
}
