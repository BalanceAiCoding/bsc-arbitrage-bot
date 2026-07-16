import { ethers } from "ethers";
import { IDEXConnector } from "../types";
import { PancakeSwapV2Connector } from "./PancakeSwapV2";
import { PancakeSwapV3Connector } from "./PancakeSwapV3";
import { BiswapConnector } from "./Biswap";
import { ApeSwapConnector } from "./ApeSwap";
import { DEX_CONFIG } from "../config";
import { logger } from "../utils/logger";

/**
 * DEX 管理器 - 统一管理所有 DEX 连接器
 */
export class DEXManager {
  private dexes: Map<string, IDEXConnector> = new Map();
  private provider: ethers.Provider;

  constructor(provider: ethers.Provider) {
    this.provider = provider;
    this.initializeDEXes();
  }

  /**
   * 初始化所有 DEX 连接器
   */
  private initializeDEXes(): void {
    try {
      // PancakeSwap V2
      this.dexes.set(
        "pancakeswap-v2",
        new PancakeSwapV2Connector(
          DEX_CONFIG.pancakeswapV2.router,
          DEX_CONFIG.pancakeswapV2.factory,
          this.provider
        )
      );

      // PancakeSwap V3
      this.dexes.set(
        "pancakeswap-v3",
        new PancakeSwapV3Connector(
          DEX_CONFIG.pancakeswapV3.router,
          "0xB048Bbc1C6f8BB71fA6935BE485ba13EaEeA29D0", // Quoter
          DEX_CONFIG.pancakeswapV3.factory,
          this.provider
        )
      );

      // Biswap
      this.dexes.set(
        "biswap",
        new BiswapConnector(
          DEX_CONFIG.biswap.router,
          DEX_CONFIG.biswap.factory,
          this.provider
        )
      );

      // ApeSwap
      this.dexes.set(
        "apeswap",
        new ApeSwapConnector(
          DEX_CONFIG.apeswap.router,
          DEX_CONFIG.apeswap.factory,
          this.provider
        )
      );

      logger.info("DEX Manager initialized", { 
        dexes: Array.from(this.dexes.keys()) 
      });
    } catch (error) {
      logger.error("Failed to initialize DEX Manager", { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * 获取所有 DEX 连接器
   */
  getAllDEXes(): IDEXConnector[] {
    return Array.from(this.dexes.values());
  }

  /**
   * 获取指定 DEX 连接器
   */
  getDEX(name: string): IDEXConnector | undefined {
    return this.dexes.get(name);
  }

  /**
   * 获取所有 DEX 名称
   */
  getDEXNames(): string[] {
    return Array.from(this.dexes.keys());
  }

  /**
   * 获取所有 DEX 的价格
   */
  async getAllPrices(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<Map<string, bigint>> {
    const prices = new Map<string, bigint>();

    for (const [name, dex] of this.dexes) {
      try {
        const price = await dex.getPrice(tokenIn, tokenOut, amountIn);
        prices.set(name, price);
      } catch (error) {
        logger.warn(`Failed to get price from ${name}`, { error: (error as Error).message });
        prices.set(name, BigInt(0));
      }
    }

    return prices;
  }

  /**
   * 获取所有 DEX 的输出金额
   */
  async getAllAmountsOut(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<Map<string, bigint>> {
    const amounts = new Map<string, bigint>();

    for (const [name, dex] of this.dexes) {
      try {
        const amountOut = await dex.getAmountOut(tokenIn, tokenOut, amountIn);
        amounts.set(name, amountOut);
      } catch (error) {
        logger.warn(`Failed to get amount out from ${name}`, { error: (error as Error).message });
        amounts.set(name, BigInt(0));
      }
    }

    return amounts;
  }

  /**
   * 获取所有 DEX 的储备量
   */
  async getAllReserves(
    tokenA: string,
    tokenB: string
  ): Promise<Map<string, [bigint, bigint]>> {
    const reserves = new Map<string, [bigint, bigint]>();

    for (const [name, dex] of this.dexes) {
      try {
        const reserve = await dex.getReserves(tokenA, tokenB);
        reserves.set(name, reserve);
      } catch (error) {
        logger.warn(`Failed to get reserves from ${name}`, { error: (error as Error).message });
        reserves.set(name, [BigInt(0), BigInt(0)]);
      }
    }

    return reserves;
  }

  /**
   * 检查代币对在哪些 DEX 上有流动性
   */
  async getAvailableDEXes(tokenA: string, tokenB: string): Promise<string[]> {
    const available: string[] = [];

    for (const [name, dex] of this.dexes) {
      try {
        const reserves = await dex.getReserves(tokenA, tokenB);
        if (reserves[0] > BigInt(0) && reserves[1] > BigInt(0)) {
          available.push(name);
        }
      } catch {
        // 忽略错误
      }
    }

    return available;
  }
}
