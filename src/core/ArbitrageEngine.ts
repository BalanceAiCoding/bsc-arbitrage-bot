import { ethers } from "ethers";
import { ArbitrageOpportunity, ExecutionResult, BotStatus } from "../types";
import { PriceMonitor } from "./PriceMonitor";
import { OpportunityFinder } from "./OpportunityFinder";
import { ArbitrageExecutor } from "./ArbitrageExecutor";
import { DEXManager } from "../dex";
import { logger } from "../utils/logger";
import { TOKEN_CONFIG } from "../config";
import { TokenInfo } from "../types";

/**
 * 套利引擎 - 主控循环
 */
export class ArbitrageEngine {
  private priceMonitor: PriceMonitor;
  private opportunityFinder: OpportunityFinder;
  private executor: ArbitrageExecutor;
  private dexManager: DEXManager;
  private status: BotStatus = "paused";
  private running: boolean = false;
  private tokens: TokenInfo[];

  constructor(
    dexManager: DEXManager,
    wallet: ethers.Wallet,
    provider: ethers.Provider
  ) {
    this.dexManager = dexManager;
    this.priceMonitor = new PriceMonitor(dexManager);
    this.opportunityFinder = new OpportunityFinder(
      this.priceMonitor,
      dexManager,
      provider
    );
    this.executor = new ArbitrageExecutor(dexManager, wallet, provider);
    
    // 默认监控的代币
    this.tokens = Object.values(TOKEN_CONFIG);
  }

  /**
   * 启动套利引擎
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Arbitrage engine is already running");
      return;
    }

    this.running = true;
    this.status = "running";
    logger.info("Arbitrage engine started");

    try {
      while (this.running) {
        await this.runCycle();
      }
    } catch (error) {
      this.status = "error";
      logger.error("Arbitrage engine crashed", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 停止套利引擎
   */
  stop(): void {
    this.running = false;
    this.status = "paused";
    logger.info("Arbitrage engine stopped");
  }

  /**
   * 运行一个扫描周期
   */
  private async runCycle(): Promise<void> {
    try {
      // 1. 更新价格
      await this.priceMonitor.updateAllPrices(this.tokens);

      // 2. 扫描套利机会
      const opportunities = await this.opportunityFinder.scanOpportunities(this.tokens);

      // 3. 执行最优机会
      if (opportunities.length > 0) {
        const bestOpportunity = opportunities[0];
        
        logger.info(`Found ${opportunities.length} opportunities`, {
          bestProfit: ethers.formatEther(bestOpportunity.netProfit),
          buyDex: bestOpportunity.buyDex,
          sellDex: bestOpportunity.sellDex,
        });

        // 执行套利（需要安全模块检查）
        // 注意：实际执行前应该通过安全守卫检查
        // const result = await this.executor.execute(bestOpportunity);
        // this.handleExecutionResult(result);
        
        // 当前仅记录机会，不自动执行（等待安全模块集成）
        logger.info(`Opportunity detected (not executed - waiting for security module)`, {
          profit: ethers.formatEther(bestOpportunity.netProfit),
        });
      } else {
        logger.debug("No profitable opportunities found");
      }

      // 4. 等待下一个扫描周期
      await this.sleep(3000);
    } catch (error) {
      logger.error("Cycle error", { error: (error as Error).message });
      await this.sleep(5000); // 错误后等待更长时间
    }
  }

  /**
   * 处理执行结果
   */
  private handleExecutionResult(result: ExecutionResult): void {
    if (result.success) {
      logger.info(`Execution successful`, {
        txHash: result.txHash,
        profit: result.actualProfit ? ethers.formatEther(result.actualProfit) : "0",
      });
    } else {
      logger.error(`Execution failed`, { error: result.error });
    }
  }

  /**
   * 添加监控代币
   */
  addToken(token: TokenInfo): void {
    this.tokens.push(token);
    logger.info(`Token added`, { symbol: token.symbol, address: token.address });
  }

  /**
   * 移除监控代币
   */
  removeToken(tokenAddress: string): void {
    this.tokens = this.tokens.filter(t => t.address !== tokenAddress);
    logger.info(`Token removed`, { address: tokenAddress });
  }

  /**
   * 获取状态
   */
  getStatus(): BotStatus {
    return this.status;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    status: BotStatus;
    tokens: number;
    dexes: number;
    priceCache: ReturnType<PriceMonitor["getStats"]>;
  } {
    return {
      status: this.status,
      tokens: this.tokens.length,
      dexes: this.dexManager.getAllDEXes().length,
      priceCache: this.priceMonitor.getStats(),
    };
  }

  /**
   * 休眠
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
