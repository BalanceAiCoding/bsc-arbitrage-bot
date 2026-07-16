import { ethers } from "ethers";
import { IDEXConnector } from "../types";
import { logger } from "../utils/logger";

// PancakeSwap V3 Router ABI（简化版）
const ROUTER_ABI_V3 = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) calldata params) external payable returns (uint256 amountOut)",
  "function exactInput(tuple(bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) calldata params) external payable returns (uint256 amountOut)",
];

const QUOTER_ABI_V3 = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
];

const FACTORY_ABI_V3 = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

const POOL_ABI_V3 = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

// 费率层级
const FEE_TIERS = [100, 500, 2500, 10000]; // 0.01%, 0.05%, 0.25%, 1%

/**
 * PancakeSwap V3 DEX 连接器
 */
export class PancakeSwapV3Connector implements IDEXConnector {
  name = "PancakeSwap V3";
  
  private router: ethers.Contract;
  private quoter: ethers.Contract;
  private factory: ethers.Contract;
  private provider: ethers.Provider;

  constructor(
    routerAddress: string,
    quoterAddress: string,
    factoryAddress: string,
    provider: ethers.Provider
  ) {
    this.provider = provider;
    this.router = new ethers.Contract(routerAddress, ROUTER_ABI_V3, provider);
    this.quoter = new ethers.Contract(quoterAddress, QUOTER_ABI_V3, provider);
    this.factory = new ethers.Contract(factoryAddress, FACTORY_ABI_V3, provider);
  }

  /**
   * 获取最优费率和输出金额
   */
  async getAmountOut(
    tokenIn: string,
    tokenOut: string,
    amountIn: ethers.BigNumber
  ): Promise<ethers.BigNumber> {
    let bestAmountOut = BigInt(0);
    let bestFee = 0;

    // 遍历所有费率层级，找到最优价格
    for (const fee of FEE_TIERS) {
      try {
        const poolAddress = await this.factory.getPool(tokenIn, tokenOut, fee);
        if (poolAddress === ethers.ZeroAddress) continue;

        const [amountOut] = await this.quoter.quoteExactInputSingle(
          tokenIn,
          tokenOut,
          fee,
          amountIn,
          0
        );

        if (amountOut > bestAmountOut) {
          bestAmountOut = amountOut;
          bestFee = fee;
        }
      } catch (error) {
        // 该费率层级可能没有池子，忽略错误
        continue;
      }
    }

    if (bestAmountOut === BigInt(0)) {
      logger.warn("No valid pool found for swap", { 
        dex: this.name, 
        tokenIn, 
        tokenOut 
      });
    }

    return bestAmountOut;
  }

  /**
   * 获取价格
   */
  async getPrice(
    tokenIn: string,
    tokenOut: string,
    amountIn: ethers.BigNumber = ethers.parseUnits("1", 18)
  ): Promise<ethers.BigNumber> {
    const amountOut = await this.getAmountOut(tokenIn, tokenOut, amountIn);
    if (amountOut === BigInt(0)) return BigInt(0);
    
    return (amountOut * BigInt(10 ** 18)) / amountIn;
  }

  /**
   * 获取储备量（V3 使用流动性而非储备量）
   */
  async getReserves(
    tokenA: string,
    tokenB: string
  ): Promise<[ethers.BigNumber, ethers.BigNumber]> {
    try {
      // 找到流动性最大的池子
      let bestPool: string | null = null;
      let bestLiquidity = BigInt(0);

      for (const fee of FEE_TIERS) {
        const poolAddress = await this.factory.getPool(tokenA, tokenB, fee);
        if (poolAddress === ethers.ZeroAddress) continue;

        const pool = new ethers.Contract(poolAddress, POOL_ABI_V3, this.provider);
        const liquidity = await pool.liquidity();
        
        if (liquidity > bestLiquidity) {
          bestLiquidity = liquidity;
          bestPool = poolAddress;
        }
      }

      if (!bestPool) {
        return [BigInt(0), BigInt(0)];
      }

      const pool = new ethers.Contract(bestPool, POOL_ABI_V3, this.provider);
      const [sqrtPriceX96] = await pool.slot0();
      const token0 = await pool.token0();

      // 计算价格
      const price = (sqrtPriceX96 * sqrtPriceX96) / BigInt(2 ** 192);
      
      // 返回模拟的储备量（基于流动性）
      if (tokenA.toLowerCase() === token0.toLowerCase()) {
        return [bestLiquidity, bestLiquidity * price / BigInt(10 ** 18)];
      } else {
        return [bestLiquidity * price / BigInt(10 ** 18), bestLiquidity];
      }
    } catch (error) {
      logger.error("Failed to get V3 reserves", { 
        dex: this.name, 
        tokenA, 
        tokenB, 
        error: (error as Error).message 
      });
      return [BigInt(0), BigInt(0)];
    }
  }

  /**
   * 获取最优费率
   */
  async getOptimalFee(tokenIn: string, tokenOut: string): Promise<number> {
    let bestAmountOut = BigInt(0);
    let bestFee = 2500; // 默认 0.25%

    const testAmount = ethers.parseUnits("1", 18);

    for (const fee of FEE_TIERS) {
      try {
        const poolAddress = await this.factory.getPool(tokenIn, tokenOut, fee);
        if (poolAddress === ethers.ZeroAddress) continue;

        const [amountOut] = await this.quoter.quoteExactInputSingle(
          tokenIn,
          tokenOut,
          fee,
          testAmount,
          0
        );

        if (amountOut > bestAmountOut) {
          bestAmountOut = amountOut;
          bestFee = fee;
        }
      } catch {
        continue;
      }
    }

    return bestFee;
  }

  /**
   * 执行 V3 交换（需要 signer）
   */
  async executeSwap(
    tokenIn: string,
    tokenOut: string,
    fee: number,
    amountIn: ethers.BigNumber,
    amountOutMin: ethers.BigNumber,
    deadline: number,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    const routerWithSigner = this.router.connect(signer);
    const to = await signer.getAddress();

    return routerWithSigner.exactInputSingle({
      tokenIn,
      tokenOut,
      fee,
      recipient: to,
      deadline,
      amountIn,
      amountOutMinimum: amountOutMin,
      sqrtPriceLimitX96: 0,
    });
  }
}
