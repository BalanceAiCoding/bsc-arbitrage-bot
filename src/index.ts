import { ethers } from "ethers";
import { ArbitrageEngine } from "./core/ArbitrageEngine";
import { DEXManager } from "./dex";
import { SecurityCoordinator } from "./security";
import { logger } from "./utils/logger";
import { getProvider, getWallet } from "./config";
import { TOKEN_CONFIG } from "./config";

/**
 * 主入口函数
 */
async function main() {
  try {
    logger.info("Starting BSC Arbitrage Bot...");

    // 1. 初始化 Provider 和 Wallet
    const provider = getProvider();
    const wallet = getWallet(provider);
    
    logger.info("Wallet initialized", { address: wallet.address });

    // 2. 检查余额
    const balance = await provider.getBalance(wallet.address);
    logger.info("Wallet balance", { balance: ethers.formatEther(balance), unit: "BNB" });

    if (balance < ethers.parseEther("0.01")) {
      logger.error("Insufficient balance. Please fund the wallet.");
      process.exit(1);
    }

    // 3. 初始化 DEX 管理器
    const dexManager = new DEXManager(provider);
    logger.info("DEX Manager initialized");

    // 4. 初始化安全协调器
    const security = new SecurityCoordinator(provider, process.env.PRIVATE_KEY!);
    logger.info("Security coordinator initialized");

    // 5. 初始化套利引擎
    const engine = new ArbitrageEngine(dexManager, wallet, provider);
    logger.info("Arbitrage engine initialized");

    // 6. 添加监控代币（可以自定义）
    const tokens = Object.values(TOKEN_CONFIG);
    logger.info("Monitoring tokens", { count: tokens.length });

    // 7. 启动引擎
    logger.info("Starting arbitrage engine...");
    await engine.start();

  } catch (error) {
    logger.error("Fatal error", { error: (error as Error).message });
    process.exit(1);
  }
}

// 处理信号
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down...");
  process.exit(0);
});

// 启动
if (require.main === module) {
  main();
}

export { main };
