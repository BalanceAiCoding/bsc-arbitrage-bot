import { ethers } from "ethers";
import { logger } from "./logger";

// RPC 管理器配置
interface RPCConfig {
  url: string;
  weight: number; // 权重，用于负载均衡
  isPrivate: boolean;
  lastError?: number;
  consecutiveErrors: number;
}

class RPCManager {
  private rpcs: RPCConfig[];
  private currentIndex: number = 0;
  private readonly maxConsecutiveErrors = 3;
  private readonly errorCooldownMs = 60000; // 1 分钟冷却

  constructor() {
    this.rpcs = this.initializeRPCs();
  }

  private initializeRPCs(): RPCConfig[] {
    const configs: RPCConfig[] = [
      {
        url: "https://bsc-dataseed.binance.org",
        weight: 10,
        isPrivate: false,
        consecutiveErrors: 0,
      },
      {
        url: "https://bsc-dataseed1.defibit.io",
        weight: 10,
        isPrivate: false,
        consecutiveErrors: 0,
      },
      {
        url: "https://bsc-dataseed1.ninicoin.io",
        weight: 10,
        isPrivate: false,
        consecutiveErrors: 0,
      },
      {
        url: "https://rpc.ankr.com/bsc",
        weight: 5,
        isPrivate: false,
        consecutiveErrors: 0,
      },
    ];

    // 如果配置了私有 RPC，添加到列表头部（高优先级）
    if (process.env.PRIVATE_RPC_URL) {
      configs.unshift({
        url: process.env.PRIVATE_RPC_URL,
        weight: 20,
        isPrivate: true,
        consecutiveErrors: 0,
      });
    }

    return configs;
  }

  /**
   * 获取下一个可用的 RPC
   */
  getNextRPC(): string {
    const now = Date.now();
    
    // 尝试找到一个健康的 RPC
    for (let i = 0; i < this.rpcs.length; i++) {
      const index = (this.currentIndex + i) % this.rpcs.length;
      const rpc = this.rpcs[index];
      
      // 检查是否在冷却期
      if (rpc.lastError && now - rpc.lastError < this.errorCooldownMs) {
        continue;
      }
      
      // 检查连续错误次数
      if (rpc.consecutiveErrors >= this.maxConsecutiveErrors) {
        continue;
      }
      
      this.currentIndex = index;
      return rpc.url;
    }
    
    // 如果所有 RPC 都不可用，重置并返回第一个
    logger.warn("All RPCs appear unhealthy, resetting error counters");
    this.rpcs.forEach(rpc => {
      rpc.consecutiveErrors = 0;
      rpc.lastError = undefined;
    });
    
    return this.rpcs[0].url;
  }

  /**
   * 记录 RPC 错误
   */
  recordError(rpcUrl: string): void {
    const rpc = this.rpcs.find(r => r.url === rpcUrl);
    if (rpc) {
      rpc.consecutiveErrors++;
      rpc.lastError = Date.now();
      logger.warn(`RPC error recorded`, { url: rpcUrl, consecutiveErrors: rpc.consecutiveErrors });
    }
  }

  /**
   * 记录 RPC 成功
   */
  recordSuccess(rpcUrl: string): void {
    const rpc = this.rpcs.find(r => r.url === rpcUrl);
    if (rpc) {
      rpc.consecutiveErrors = 0;
      rpc.lastError = undefined;
    }
  }

  /**
   * 获取 Provider（自动故障转移）
   */
  getProvider(): ethers.JsonRpcProvider {
    const url = this.getNextRPC();
    return new ethers.JsonRpcProvider(url, {
      name: "BSC",
      chainId: 56,
    });
  }

  /**
   * 检查是否有私有 RPC
   */
  hasPrivateRPC(): boolean {
    return this.rpcs.some(r => r.isPrivate);
  }

  /**
   * 获取 RPC 状态
   */
  getStatus(): { url: string; healthy: boolean; isPrivate: boolean }[] {
    const now = Date.now();
    return this.rpcs.map(rpc => ({
      url: rpc.url,
      healthy: rpc.consecutiveErrors < this.maxConsecutiveErrors && 
               (!rpc.lastError || now - rpc.lastError > this.errorCooldownMs),
      isPrivate: rpc.isPrivate,
    }));
  }
}

export const rpcManager = new RPCManager();

/**
 * 创建带有自动重试的 Provider
 */
export function createResilientProvider(): ethers.JsonRpcProvider {
  return rpcManager.getProvider();
}

/**
 * 执行带有 RPC 故障转移的异步操作
 */
export async function withRPCFailover<T>(
  operation: (provider: ethers.JsonRpcProvider) => Promise<T>
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let i = 0; i < 3; i++) { // 最多尝试 3 个 RPC
    const provider = rpcManager.getProvider();
    const rpcUrl = (provider as any)._getConnection?.()?.url || "unknown";
    
    try {
      const result = await operation(provider);
      rpcManager.recordSuccess(rpcUrl);
      return result;
    } catch (error) {
      lastError = error as Error;
      rpcManager.recordError(rpcUrl);
      logger.warn(`RPC operation failed, trying next`, { rpcUrl, error: lastError.message });
    }
  }
  
  throw lastError || new Error("All RPCs failed");
}
