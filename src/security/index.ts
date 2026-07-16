import { ethers } from "ethers";
import { ArbitrageOpportunity, ExecutionResult, ISecurityGuard } from "../types";
import { SpendLimitGuard } from "./SpendLimitGuard";
import { CircuitBreaker } from "./CircuitBreaker";
import { SimulationGuard } from "./SimulationGuard";
import { SlippageGuard } from "./SlippageGuard";
import { WalletManager } from "./WalletManager";
import { logger } from "../utils/logger";

/**
 * 安全协调器
 * 统一管理所有安全模块
 */
export class SecurityCoordinator {
  private guards: ISecurityGuard[] = [];
  private spendLimitGuard: SpendLimitGuard;
  private circuitBreaker: CircuitBreaker;
  private simulationGuard: SimulationGuard;
  private slippageGuard: SlippageGuard;
  private walletManager: WalletManager;

  constructor(provider: ethers.Provider, privateKey: string) {
    this.spendLimitGuard = new SpendLimitGuard();
    this.circuitBreaker = new CircuitBreaker();
    this.simulationGuard = new SimulationGuard(provider);
    this.slippageGuard = new SlippageGuard();
    this.walletManager = new WalletManager(privateKey, provider);

    this.guards = [
      this.spendLimitGuard,
      this.circuitBreaker,
      this.simulationGuard,
      this.slippageGuard,
    ];
  }

  /**
   * 执行完整的安全检查
   */
  async validate(opportunity: ArbitrageOpportunity): Promise<{
    allowed: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];

    // 1. 检查熔断器
    if (this.circuitBreaker.isHalted()) {
      const status = this.circuitBreaker.getStatus();
      reasons.push(`Circuit breaker active: ${status.reason}`);
      return { allowed: false, reasons };
    }

    // 2. 检查支出限制
    const spendLimitOk = await this.spendLimitGuard.check(opportunity);
    if (!spendLimitOk) {
      reasons.push("Spend limit exceeded");
    }

    // 3. 检查滑点
    const slippageOk = await this.slippageGuard.check(opportunity);
    if (!slippageOk) {
      reasons.push("Slippage too high");
    }

    // 4. 模拟交易
    const simulationOk = await this.simulationGuard.check(opportunity);
    if (!simulationOk) {
      reasons.push("Simulation failed");
    }

    // 5. 检查钱包余额
    const hasGas = await this.walletManager.hasEnoughGas();
    if (!hasGas) {
      reasons.push("Insufficient gas balance");
    }

    const allowed = reasons.length === 0;

    if (allowed) {
      logger.info(`Security validation passed`);
    } else {
      logger.warn(`Security validation failed`, { reasons });
    }

    return { allowed, reasons };
  }

  /**
   * 记录执行结果
   */
  recordExecution(result: ExecutionResult): void {
    this.spendLimitGuard.recordExecution(result);
    this.circuitBreaker.recordExecution(result);
    this.simulationGuard.recordExecution();
    this.slippageGuard.recordExecution();
  }

  /**
   * 记录支出
   */
  recordSpend(amount: bigint): void {
    this.spendLimitGuard.recordSpend(amount);
  }

  /**
   * 更新投资组合价值（用于熔断器）
   */
  updatePortfolioValue(value: bigint): void {
    this.circuitBreaker.updatePortfolioValue(value);
  }

  /**
   * 手动熔断
   */
  manualHalt(reason: string): void {
    this.circuitBreaker.manualHalt(reason);
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * 获取钱包管理器
   */
  getWalletManager(): WalletManager {
    return this.walletManager;
  }

  /**
   * 获取安全状态
   */
  getStatus(): {
    circuitBreaker: ReturnType<CircuitBreaker["getStatus"]>;
    spendLimit: ReturnType<SpendLimitGuard["getStats"]>;
    simulation: ReturnType<SimulationGuard["getStats"]>;
    slippage: ReturnType<SlippageGuard["getStats"]>;
    wallet: string;
  } {
    return {
      circuitBreaker: this.circuitBreaker.getStatus(),
      spendLimit: this.spendLimitGuard.getStats(),
      simulation: this.simulationGuard.getStats(),
      slippage: this.slippageGuard.getStats(),
      wallet: this.walletManager.getAddress(),
    };
  }

  /**
   * 检查是否可以交易
   */
  canTrade(): boolean {
    return !this.circuitBreaker.isHalted() && !this.slippageGuard.isHalted();
  }
}
