import { ethers } from "ethers";
import { ISecurityGuard } from "../types";
import { logger } from "../utils/logger";
import { SECURITY_CONFIG } from "../config";

/**
 * 熔断机制
 * 当亏损超过阈值时自动暂停交易
 */
export class CircuitBreaker implements ISecurityGuard {
  private consecutiveLosses: number = 0;
  private hourStartValue: bigint = BigInt(0);
  private hourStartTime: number = 0;
  private dayStartValue: bigint = BigInt(0);
  private dayStartTime: number = 0;
  private halted: boolean = false;
  private haltReason: string = "";
  private haltTime: number = 0;

  constructor() {
    // 每小时检查一次
    setInterval(() => this.checkHourlyReset(), 60 * 60 * 1000);
  }

  /**
   * 检查是否允许交易
   */
  async check(): Promise<boolean> {
    if (this.halted) {
      const haltDuration = Date.now() - this.haltTime;
      const maxHaltDuration = 24 * 60 * 60 * 1000; // 最大暂停 24 小时
      
      if (haltDuration > maxHaltDuration) {
        // 自动恢复
        this.reset();
        logger.info(`Circuit breaker auto-reset after ${maxHaltDuration / 1000 / 60 / 60} hours`);
        return true;
      }
      
      logger.warn(`Circuit breaker is active`, { reason: this.haltReason, duration: Math.floor(haltDuration / 1000 / 60) });
      return false;
    }

    return true;
  }

  /**
   * 记录执行结果并检查是否需要熔断
   */
  recordExecution(result: { success: boolean; actualProfit?: bigint }): void {
    if (!result.success) {
      this.consecutiveLosses++;
      
      if (this.consecutiveLosses >= SECURITY_CONFIG.maxConsecutiveLosses) {
        this.halt("Too many consecutive losses", {
          consecutiveLosses: this.consecutiveLosses,
          threshold: SECURITY_CONFIG.maxConsecutiveLosses,
        });
      }
      return;
    }

    // 检查利润
    if (result.actualProfit && result.actualProfit < BigInt(0)) {
      this.consecutiveLosses++;
      
      // 检查小时亏损
      if (this.hourStartValue > BigInt(0)) {
        const hourlyPnL = this.calculatePnLPct(this.hourStartValue, result.actualProfit);
        if (hourlyPnL < -SECURITY_CONFIG.maxHourlyLossPct) {
          this.halt(`Hourly loss exceeded`, {
            hourlyPnL,
            threshold: SECURITY_CONFIG.maxHourlyLossPct,
          });
          return;
        }
      }

      // 检查日亏损
      if (this.dayStartValue > BigInt(0)) {
        const dailyPnL = this.calculatePnLPct(this.dayStartValue, result.actualProfit);
        if (dailyPnL < -SECURITY_CONFIG.maxDailyLossPct) {
          this.halt(`Daily loss exceeded`, {
            dailyPnL,
            threshold: SECURITY_CONFIG.maxDailyLossPct,
          });
          return;
        }
      }
    } else {
      // 盈利，重置连续亏损
      if (this.consecutiveLosses > 0) {
        this.consecutiveLosses = 0;
        logger.info(`Consecutive losses reset after profitable trade`);
      }
    }
  }

  /**
   * 更新投资组合价值（用于计算 PnL）
   */
  updatePortfolioValue(value: bigint): void {
    const now = Date.now();

    // 初始化小时起始值
    if (this.hourStartValue === BigInt(0) || now - this.hourStartTime > 60 * 60 * 1000) {
      this.hourStartValue = value;
      this.hourStartTime = now;
    }

    // 初始化日起始值
    if (this.dayStartValue === BigInt(0) || now - this.dayStartTime > 24 * 60 * 60 * 1000) {
      this.dayStartValue = value;
      this.dayStartTime = now;
    }
  }

  /**
   * 手动熔断
   */
  manualHalt(reason: string): void {
    this.halt(`Manual halt: ${reason}`, {});
  }

  /**
   * 手动重置
   */
  reset(): void {
    this.halted = false;
    this.haltReason = "";
    this.haltTime = 0;
    this.consecutiveLosses = 0;
    this.hourStartValue = BigInt(0);
    this.dayStartValue = BigInt(0);
    logger.info(`Circuit breaker reset`);
  }

  /**
   * 检查是否暂停
   */
  isHalted(): boolean {
    return this.halted;
  }

  /**
   * 获取状态
   */
  getStatus(): {
    halted: boolean;
    reason: string;
    consecutiveLosses: number;
    haltDuration: number;
  } {
    return {
      halted: this.halted,
      reason: this.haltReason,
      consecutiveLosses: this.consecutiveLosses,
      haltDuration: this.halted ? Date.now() - this.haltTime : 0,
    };
  }

  /**
   * 熔断
   */
  private halt(reason: string, context: Record<string, any>): void {
    this.halted = true;
    this.haltReason = reason;
    this.haltTime = Date.now();
    
    logger.error(`CIRCUIT BREAKER TRIGGERED`, {
      reason,
      ...context,
      timestamp: new Date().toISOString(),
    });

    // 这里可以添加通知逻辑（如发送 Telegram 消息）
  }

  /**
   * 计算收益率百分比
   */
  private calculatePnLPct(startValue: bigint, profit: bigint): number {
    if (startValue === BigInt(0)) return 0;
    return Number(profit) / Number(startValue);
  }

  /**
   * 检查是否需要重置小时统计
   */
  private checkHourlyReset(): void {
    const now = Date.now();
    if (now - this.hourStartTime > 60 * 60 * 1000) {
      this.hourStartValue = BigInt(0);
      this.hourStartTime = now;
      logger.debug(`Hourly stats reset`);
    }
  }
}
