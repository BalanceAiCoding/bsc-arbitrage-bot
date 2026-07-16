import { ethers } from "ethers";
import { IDEXConnector, PriceInfo, ArbitrageOpportunity, TokenInfo } from "../types";
import { DEXManager } from "../dex";
import { logger } from "../utils/logger";
import { calculatePriceDiffBps, isValidPrice } from "../utils/priceUtils";
import { estimateGasCost } from "../utils/gasEstimator";
import { ARBITRAGE_CONFIG, TOKEN_CONFIG } from "../config";

/**
 * 价格监控器 - 实时监控多个 DEX 的代币价格
 */
export class PriceMonitor {
  private dexManager: DEXManager;
  private priceCache: Map<string, PriceInfo> = new Map();
  private lastUpdate: number = 0;
  private readonly updateInterval: number = ARBITRAGE_CONFIG.scanIntervalMs;

  constructor(dexManager: DEXManager) {
    this.dexManager = dexManager;
  }

  /**
   * 获取价格缓存键
   */
  private getCacheKey(tokenIn: string, tokenOut: string, dex: string): string {
    return `${tokenIn}-${tokenOut}-${dex}`;
  }

  /**
   * 更新所有代币对的价格
   */
  async updateAllPrices(tokens: TokenInfo[]): Promise<void> {
    const now = Date.now();
    const dexes = this.dexManager.getAllDEXes();

    // 生成所有代币对组合
    const pairs = this.generateTokenPairs(tokens);

    for (const { tokenA, tokenB } of pairs) {
      for (const dex of dexes) {
        try {
          const price = await dex.getPrice(tokenA.address, tokenB.address);
          
          const priceInfo: PriceInfo = {
            tokenIn: tokenA.address,
            tokenOut: tokenB.address,
            dex: dex.name,
            price,
            timestamp: now,
          };

          const cacheKey = this.getCacheKey(tokenA.address, tokenB.address, dex.name);
          this.priceCache.set(cacheKey, priceInfo);
        } catch (error) {
          logger.warn(`Failed to update price`, {
            tokenA: tokenA.symbol,
            tokenB: tokenB.symbol,
            dex: dex.name,
            error: (error as Error).message,
          });
        }
      }
    }

    this.lastUpdate = now;
    logger.debug(`Price cache updated`, { pairs: pairs.length, dexes: dexes.length });
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
   * 获取特定代币对的价格
   */
  getPrice(tokenIn: string, tokenOut: string, dex: string): PriceInfo | undefined {
    const cacheKey = this.getCacheKey(tokenIn, tokenOut, dex);
    return this.priceCache.get(cacheKey);
  }

  /**
   * 获取所有 DEX 的特定代币对价格
   */
  getAllPricesForPair(tokenIn: string, tokenOut: string): Map<string, PriceInfo> {
    const prices = new Map<string, PriceInfo>();
    const dexNames = this.dexManager.getDEXNames();

    for (const dexName of dexNames) {
      const price = this.getPrice(tokenIn, tokenOut, dexName);
      if (price) {
        prices.set(dexName, price);
      }
    }

    return prices;
  }

  /**
   * 获取价格缓存
   */
  getPriceCache(): Map<string, PriceInfo> {
    return new Map(this.priceCache);
  }

  /**
   * 检查缓存是否过期
   */
  isCacheExpired(): boolean {
    return Date.now() - this.lastUpdate > this.updateInterval * 2;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.priceCache.clear();
    this.lastUpdate = 0;
  }

  /**
   * 获取监控统计
   */
  getStats(): {
    totalPrices: number;
    lastUpdate: number;
    isExpired: boolean;
  } {
    return {
      totalPrices: this.priceCache.size,
      lastUpdate: this.lastUpdate,
      isExpired: this.isCacheExpired(),
    };
  }
}
