import { ethers } from "ethers";
import { IDEXConnector, TokenInfo } from "../types";
import { logger } from "../utils/logger";

// PancakeSwap V2 Router ABI（简化版，只包含需要的函数）
const ROUTER_ABI_V2 = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
];

const FACTORY_ABI_V2 = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
];

const PAIR_ABI_V2 = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
];

/**
 * PancakeSwap V2 DEX 连接器
 */
export class PancakeSwapV2Connector implements IDEXConnector {
  name = "PancakeSwap V2";
  
  private router: ethers.Contract;
  private factory: ethers.Contract;
  private provider: ethers.Provider;
  private feeBps: number = 25; // 0.25%

  constructor(
    routerAddress: string,
    factoryAddress: string,
    provider: ethers.Provider
  ) {
    this.provider = provider;
    this.router = new ethers.Contract(routerAddress, ROUTER_ABI_V2, provider);
    this.factory = new ethers.Contract(factoryAddress, FACTORY_ABI_V2, provider);
  }

  /**
   * 获取交易对的储备量
   */
  async getReserves(
    tokenA: string,
    tokenB: string
  ): Promise<[ethers.BigNumber, ethers.BigNumber]> {
    try {
      const pairAddress = await this.factory.getPair(tokenA, tokenB);
      
      if (pairAddress === ethers.ZeroAddress) {
        return [BigInt(0), BigInt(0)];
      }

      const pair = new ethers.Contract(pairAddress, PAIR_ABI_V2, this.provider);
      const [reserve0, reserve1] = await pair.getReserves();
      const token0 = await pair.token0();

      // 确保 reserveIn 对应 tokenA
      if (tokenA.toLowerCase() === token0.toLowerCase()) {
        return [reserve0, reserve1];
      } else {
        return [reserve1, reserve0];
      }
    } catch (error) {
      logger.error("Failed to get reserves", { 
        dex: this.name, 
        tokenA, 
        tokenB, 
        error: (error as Error).message 
      });
      return [BigInt(0), BigInt(0)];
    }
  }

  /**
   * 获取给定输入金额的输出金额
   */
  async getAmountOut(
    tokenIn: string,
    tokenOut: string,
    amountIn: ethers.BigNumber
  ): Promise<ethers.BigNumber> {
    try {
      const amounts = await this.router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
      return amounts[1];
    } catch (error) {
      logger.error("Failed to get amount out", { 
        dex: this.name, 
        tokenIn, 
        tokenOut, 
        amountIn: amountIn.toString(),
        error: (error as Error).message 
      });
      return BigInt(0);
    }
  }

  /**
   * 获取价格（amountOut / amountIn）
   */
  async getPrice(
    tokenIn: string,
    tokenOut: string,
    amountIn: ethers.BigNumber = ethers.parseUnits("1", 18)
  ): Promise<ethers.BigNumber> {
    const amountOut = await this.getAmountOut(tokenIn, tokenOut, amountIn);
    if (amountOut === BigInt(0)) return BigInt(0);
    
    // 价格 = amountOut / amountIn
    return (amountOut * BigInt(10 ** 18)) / amountIn;
  }

  /**
   * 执行交换（需要 signer）
   */
  async executeSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: ethers.BigNumber,
    amountOutMin: ethers.BigNumber,
    deadline: number,
    signer: ethers.Signer
  ): Promise<ethers.TransactionResponse> {
    const routerWithSigner = this.router.connect(signer);
    const to = await signer.getAddress();
    
    return routerWithSigner.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      [tokenIn, tokenOut],
      to,
      deadline
    );
  }

  /**
   * 获取交易对地址
   */
  async getPairAddress(tokenA: string, tokenB: string): Promise<string> {
    return this.factory.getPair(tokenA, tokenB);
  }

  /**
   * 检查交易对是否存在
   */
  async pairExists(tokenA: string, tokenB: string): Promise<boolean> {
    const pair = await this.getPairAddress(tokenA, tokenB);
    return pair !== ethers.ZeroAddress;
  }
}
