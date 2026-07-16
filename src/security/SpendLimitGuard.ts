import { ethers } from "ethers";
import { ArbitrageOpportunity, ISecurityGuard } from "../types";
import { logger } from "../utils/logger";
import { SECURITY_CONFIG } from "../config";

/**
 * 支出限制守卫
 * 防止单笔交易或单日支出超过限额
 */
export class SpendLimitGuard implements ISecurityGuard {
  private dailySpend: Map<string, bigint> = new Map(); // date -> amount
  private consecutiveFailures: number = 0;
  private lastFailureTime: number = 0;

  constructor() {
    // 每日重置支出记录
    setInterval(() => this.resetDailySpend(), 24 * 60 * 60 * 1000);
  }

  /**
   * 检查套利机会是否通过支出限制
   */
  async check(opportunity: ArbitrageOpportunity): Promise<boolean> {
    const today = this.getTodayKey();
    const currentDailySpend = this.dailySpend.get(today) || BigInt(0);

    // 1. 检查单笔交易限额
    const optimalAmountBnb = parseFloat(ethers.formatEther(opportunity.optimalAmount));
    if (optimalAmountBnb > SECURITY_CONFIG.maxSingleTxBnb) {
      logger.warn(`Single tx limit exceeded`, {
        amount: optimalAmountBnb,
        limit: SECURITY_CONFIG.maxSingleTxBnb,
      });
      return false;
    }

    // 2. 检查日限额
    const newDailySpend = currentDailySpend + opportunity.optimalAmount;
    const newDailySpendBnb = parseFloat(ethers.formatEther(newDailySpend));
    if (newDailySpendBnb > SECURITY_CONFIG.maxDailySpendBnb) {
      logger.warn(`Daily spend limit exceeded`, {
        current: parseFloat(ethers.formatEther(currentDailySpend)),
        newAmount: optimalAmountBnb,
        limit: SECURITY_CONFIG.maxDailySpendBnb,
      });
      return false;
    }

    // 3. 检查连续失败次数
    if (this.consecutiveFailures >= SECURITY_CONFIG.maxConsecutiveFailures) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      const cooldownMs = 5 * 60 * 1000; // 5 分钟冷却
      
      if (timeSinceLastFailure < cooldownMs) {
        logger.warn(`Too many consecutive failures, cooling down`, {
          failures: this.consecutiveFailures,
          cooldownRemaining: Math.ceil((cooldownMs - timeSinceLastFailure) / 1000),
        });
        return false;
      } else {
        // 冷却结束，重置失败计数
        this.consecutiveFailures = 0;
      }
    }

    logger.debug(`Spend limit check passed`, {
      amount: optimalAmountBnb,
      dailySpend: parseFloat(ethers.formatEther(currentDailySpend)),
    });

    return true;
  }

  /**
   * 记录执行结果
   */
  recordExecution(result: { success: boolean; actualProfit?: bigint }): void {
    if (!result.success) {
      this.consecutiveFailures++;
      this.lastFailureTime = Date.now();
      logger.warn(`Execution failed`, { consecutiveFailures: this.consecutiveFailures });
    } else {
      // 成功时记录支出
      const today = this.getTodayKey();
      const currentSpend = this.dailySpend.get(today) || BigInt(0);
      // 注意：这里应该记录实际支出金额，简化处理
      // this.dailySpend.set(today, currentSpend + amount);
      
      // 重置失败计数
      if (this.consecutiveFailures > 0) {
        logger.info(`Resetting consecutive failures after success`);
        this.consecutiveFailures = 0;
      }
    }
  }

  /**
   * 记录支出金额
   */
  recordSpend(amount: bigint): void {
    const today = this.getTodayKey();
    const currentSpend = this.dailySpend.get(today) || BigInt(0);
    this.dailySpend.set(today, currentSpend + amount);
    
    logger.info(`Spend recorded`, {
      amount: parseFloat(ethers.formatEther(amount)),
      dailyTotal: parseFloat(ethers.formatEther(currentSpend + amount)),
    });
  }

  /**
   * 检查是否暂停
   */
  isHalted(): boolean {
    return this.consecutiveFailures >= SECURITY_CONFIG.maxConsecutiveFailures &&
           Date.now() - this.lastFailureTime < 5 * 60 * 1000;
  }

  /**
   * 获取今日支出
   */
  getDailySpend(): bigint {
    return this.dailySpend.get(this.getTodayKey()) || BigInt(0);
  }

  /**
   * 获取今日日期键
   */
  private getTodayKey(): string {
    return new Date().toISOString().split("T")[0];
  }

  /**
   * 重置每日支出
   */
  private resetDailySpend(): void {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split("T")[0];
    
    this.dailySpend.delete(yesterdayKey);
    logger.info(`Daily spend reset`);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    dailySpend: number;
    consecutiveFailures: number;
    isHalted: boolean;
  } {
    return {
      dailySpend: parseFloat(ethers.formatEther(this.getDailySpend())),
      consecutiveFailures: this.consecutiveFailures,
      isHalted: this.isHalted(),
    };
  }
}
