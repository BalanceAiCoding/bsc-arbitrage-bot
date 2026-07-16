import { ethers } from "ethers";
import { ArbitrageOpportunity, ISecurityGuard } from "../types";
import { logger } from "../utils/logger";
import { ARBITRAGE_CONFIG } from "../config";

/**
 * 滑点保护守卫
 * 确保交易滑点在可接受范围内
 */
export class SlippageGuard implements ISecurityGuard {
  private slippageViolations: number = 0;
  private lastViolationTime: number = 0;

  /**
   * 检查滑点是否可接受
   */
  async check(opportunity: ArbitrageOpportunity): Promise<boolean> {
    try {
      // 1. 检查预期滑点
      const expectedSlippage = this.calculateExpectedSlippage(opportunity);
      
      if (expectedSlippage > ARBITRAGE_CONFIG.maxSlippageBps) {
        logger.warn(`Expected slippage too high`, {
          expectedSlippage: `${expectedSlippage} bps`,
          maxSlippage: `${ARBITRAGE_CONFIG.maxSlippageBps} bps`,
        });
        this.recordViolation();
        return false;
      }

      // 2. 检查市场深度是否足够
      const depthSufficient = await this.checkMarketDepth(opportunity);
      if (!depthSufficient) {
        logger.warn(`Insufficient market depth for trade`);
        return false;
      }

      // 3. 检查价格冲击
      const priceImpact = this.calculatePriceImpact(opportunity);
      if (priceImpact > ARBITRAGE_CONFIG.maxSlippageBps * 2) {
        logger.warn(`Price impact too high`, {
          priceImpact: `${priceImpact} bps`,
          maxAllowed: `${ARBITRAGE_CONFIG.maxSlippageBps * 2} bps`,
        });
        return false;
      }

      logger.debug(`Slippage check passed`, {
        expectedSlippage: `${expectedSlippage} bps`,
        priceImpact: `${priceImpact} bps`,
      });

      return true;
    } catch (error) {
      logger.error(`Slippage check error`, { error: (error as Error).message });
      return false;
    }
  }

  /**
   * 计算预期滑点
   */
  private calculateExpectedSlippage(opportunity: ArbitrageOpportunity): number {
    // 简化计算：基于买卖价差估算滑点
    if (opportunity.buyPrice === BigInt(0)) return 0;
    
    const priceDiff = opportunity.sellPrice - opportunity.buyPrice;
    const slippageBps = Number((priceDiff * BigInt(10000)) / opportunity.buyPrice);
    
    // 减去利润部分，得到纯滑点
    const pureSlippage = slippageBps - opportunity.profitBps;
    
    return Math.max(0, pureSlippage);
  }

  /**
   * 检查市场深度
   */
  private async checkMarketDepth(opportunity: ArbitrageOpportunity): Promise<boolean> {
    // 检查交易金额是否超过池子流动性的合理比例
    // 通常不超过 1-2% 的池子流动性
    
    // 简化实现：假设深度足够
    // 实际应该查询池子的总流动性并计算比例
    return true;
  }

  /**
   * 计算价格冲击
   */
  private calculatePriceImpact(opportunity: ArbitrageOpportunity): number {
    // 价格冲击 = 交易导致的池子价格变化百分比
    // 简化计算
    
    const tradeSize = parseFloat(ethers.formatEther(opportunity.optimalAmount));
    
    // 假设池子大小为交易金额的 100 倍
    const poolSize = tradeSize * 100;
    
    // 价格冲击 ≈ 交易金额 / 池子大小
    const impact = (tradeSize / poolSize) * 10000; // 转换为 bps
    
    return Math.floor(impact);
  }

  /**
   * 计算最小输出金额（含滑点保护）
   */
  calculateMinAmountOut(
    expectedAmountOut: ethers.BigNumber,
    customSlippageBps?: number
  ): ethers.BigNumber {
    const slippageBps = customSlippageBps || ARBITRAGE_CONFIG.maxSlippageBps;
    const multiplier = BigInt(10000 - slippageBps);
    return (expectedAmountOut * multiplier) / BigInt(10000);
  }

  /**
   * 记录滑点违规
   */
  private recordViolation(): void {
    this.slippageViolations++;
    this.lastViolationTime = Date.now();
    
    if (this.slippageViolations >= 10) {
      logger.warn(`Too many slippage violations`, {
        count: this.slippageViolations,
      });
    }
  }

  /**
   * 记录执行结果
   */
  recordExecution(): void {
    // 滑点守卫不需要记录执行结果
  }

  /**
   * 检查是否暂停
   */
  isHalted(): boolean {
    // 滑点违规过多时暂停
    if (this.slippageViolations >= 10) {
      const timeSinceLastViolation = Date.now() - this.lastViolationTime;
      return timeSinceLastViolation < 30 * 60 * 1000; // 30 分钟冷却
    }
    return false;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    violations: number;
    isHalted: boolean;
  } {
    return {
      violations: this.slippageViolations,
      isHalted: this.isHalted(),
    };
  }
}
