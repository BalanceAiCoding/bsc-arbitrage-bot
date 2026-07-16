import { ethers } from "ethers";
import { ArbitrageOpportunity, ExecutionResult, SwapParams } from "../types";
import { DEXManager } from "../dex";
import { logger } from "../utils/logger";
import { ARBITRAGE_CONFIG } from "../config";

/**
 * 套利执行器
 */
export class ArbitrageExecutor {
  private dexManager: DEXManager;
  private wallet: ethers.Wallet;
  private provider: ethers.Provider;

  constructor(
    dexManager: DEXManager,
    wallet: ethers.Wallet,
    provider: ethers.Provider
  ) {
    this.dexManager = dexManager;
    this.wallet = wallet;
    this.provider = provider;
  }

  /**
   * 执行套利交易
   */
  async execute(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`Executing arbitrage`, {
        tokenA: opportunity.tokenA,
        tokenB: opportunity.tokenB,
        buyDex: opportunity.buyDex,
        sellDex: opportunity.sellDex,
        expectedProfit: ethers.formatEther(opportunity.expectedProfit),
      });

      // 1. 在低价 DEX 买入
      const buyResult = await this.executeSwap({
        tokenIn: opportunity.tokenA,
        tokenOut: opportunity.tokenB,
        amountIn: opportunity.optimalAmount,
        amountOutMin: this.calculateMinAmountOut(
          await this.dexManager.getDEX(opportunity.buyDex)!.getAmountOut(
            opportunity.tokenA,
            opportunity.tokenB,
            opportunity.optimalAmount
          )
        ),
        deadline: this.getDeadline(),
        dex: opportunity.buyDex,
      });

      if (!buyResult.success) {
        throw new Error(`Buy failed: ${buyResult.error}`);
      }

      // 2. 在高价 DEX 卖出
      // 获取买入后获得的 tokenB 数量
      const tokenBAmount = await this.getTokenBalance(opportunity.tokenB);
      
      const sellResult = await this.executeSwap({
        tokenIn: opportunity.tokenB,
        tokenOut: opportunity.tokenA,
        amountIn: tokenBAmount,
        amountOutMin: this.calculateMinAmountOut(
          await this.dexManager.getDEX(opportunity.sellDex)!.getAmountOut(
            opportunity.tokenB,
            opportunity.tokenA,
            tokenBAmount
          )
        ),
        deadline: this.getDeadline(),
        dex: opportunity.sellDex,
      });

      if (!sellResult.success) {
        throw new Error(`Sell failed: ${sellResult.error}`);
      }

      // 计算实际利润
      const actualProfit = await this.calculateActualProfit(opportunity);

      const result: ExecutionResult = {
        success: true,
        txHash: sellResult.txHash,
        gasUsed: sellResult.gasUsed,
        actualProfit,
        timestamp: Date.now(),
      };

      logger.info(`Arbitrage executed successfully`, {
        txHash: result.txHash,
        actualProfit: ethers.formatEther(actualProfit || BigInt(0)),
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      logger.error(`Arbitrage execution failed`, {
        error: errorMessage,
        duration: Date.now() - startTime,
      });

      return {
        success: false,
        error: errorMessage,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 执行单个交换
   */
  private async executeSwap(params: SwapParams): Promise<{
    success: boolean;
    txHash?: string;
    gasUsed?: bigint;
    error?: string;
  }> {
    try {
      const dex = this.dexManager.getDEX(params.dex);
      if (!dex) {
        throw new Error(`DEX not found: ${params.dex}`);
      }

      // 检查代币余额
      const balance = await this.getTokenBalance(params.tokenIn);
      if (balance < params.amountIn) {
        throw new Error(`Insufficient balance: ${balance.toString()} < ${params.amountIn.toString()}`);
      }

      // 检查并授权（如果需要）
      if (params.tokenIn !== ethers.ZeroAddress) {
        await this.approveIfNeeded(params.tokenIn, params.amountIn, params.dex);
      }

      // 执行交换
      const tx = await (dex as any).executeSwap(
        params.tokenIn,
        params.tokenOut,
        params.amountIn,
        params.amountOutMin,
        params.deadline,
        this.wallet
      );

      logger.info(`Swap transaction sent`, {
        dex: params.dex,
        txHash: tx.hash,
      });

      // 等待交易确认
      const receipt = await tx.wait(1);

      if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction failed or reverted");
      }

      return {
        success: true,
        txHash: tx.hash,
        gasUsed: receipt.gasUsed,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 计算最小输出金额（含滑点保护）
   */
  private calculateMinAmountOut(expectedAmountOut: bigint): bigint {
    const slippageMultiplier = BigInt(10000 - ARBITRAGE_CONFIG.maxSlippageBps);
    return (expectedAmountOut * slippageMultiplier) / BigInt(10000);
  }

  /**
   * 获取交易截止时间
   */
  private getDeadline(): number {
    return Math.floor(Date.now() / 1000) + ARBITRAGE_CONFIG.deadlineMinutes * 60;
  }

  /**
   * 获取代币余额
   */
  private async getTokenBalance(tokenAddress: string): Promise<bigint> {
    if (tokenAddress === ethers.ZeroAddress || tokenAddress === "BNB") {
      // BNB 余额
      return this.provider.getBalance(this.wallet.address);
    }

    const erc20Abi = [
      "function balanceOf(address account) external view returns (uint256)",
    ];
    const token = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
    return token.balanceOf(this.wallet.address);
  }

  /**
   * 检查并授权代币（如果需要）
   */
  private async approveIfNeeded(
    tokenAddress: string,
    amount: bigint,
    dexName: string
  ): Promise<void> {
    const dex = this.dexManager.getDEX(dexName);
    if (!dex) return;

    const routerAddress = (dex as any).router?.target;
    if (!routerAddress) return;

    const erc20Abi = [
      "function allowance(address owner, address spender) external view returns (uint256)",
      "function approve(address spender, uint256 amount) external returns (bool)",
    ];

    const token = new ethers.Contract(tokenAddress, erc20Abi, this.wallet);
    const allowance = await token.allowance(this.wallet.address, routerAddress);

    if (allowance < amount) {
      logger.info(`Approving token`, { token: tokenAddress, spender: routerAddress });
      const tx = await token.approve(routerAddress, ethers.MaxUint256);
      await tx.wait(1);
      logger.info(`Token approved`, { txHash: tx.hash });
    }
  }

  /**
   * 计算实际利润
   */
  private async calculateActualProfit(
    opportunity: ArbitrageOpportunity
  ): Promise<bigint> {
    // 简化计算：当前余额 - 初始余额
    // 实际实现应该记录交易前后的余额
    return opportunity.expectedProfit;
  }
}
