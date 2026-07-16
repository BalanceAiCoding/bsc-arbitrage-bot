import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as dotenv from "dotenv";

dotenv.config();

async function main(hre: HardhatRuntimeEnvironment) {
  console.log("Deploying ArbitrageExecutor...");

  // 获取部署账户
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 检查余额
  const balance = await deployer.provider!.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "BNB");

  // 部署参数
  const owner = deployer.address;
  const maxArbitrageAmount = ethers.parseUnits("1", 18); // 1 BNB
  const minProfitBps = 50; // 0.5%

  // 部署合约
  const ArbitrageExecutor = await hre.ethers.getContractFactory("ArbitrageExecutor");
  const arbitrageExecutor = await ArbitrageExecutor.deploy(
    owner,
    maxArbitrageAmount,
    minProfitBps
  );

  await arbitrageExecutor.waitForDeployment();

  const contractAddress = await arbitrageExecutor.getAddress();
  console.log("ArbitrageExecutor deployed to:", contractAddress);

  // 配置 DEX 路由器
  console.log("Configuring DEX routers...");

  const dexConfigs = [
    { name: "pancakeswap-v2", router: "0x10ED43C718714eb63d5aA57B78B54704E256024E" },
    { name: "biswap", router: "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8" },
  ];

  for (const dex of dexConfigs) {
    const tx = await arbitrageExecutor.setDexRouter(dex.name, dex.router);
    await tx.wait();
    console.log(`Set ${dex.name} router:`, dex.router);
  }

  // 验证配置
  console.log("\nDeployment Summary:");
  console.log("====================");
  console.log("Contract:", contractAddress);
  console.log("Owner:", owner);
  console.log("Max Arbitrage:", ethers.formatEther(maxArbitrageAmount), "BNB");
  console.log("Min Profit:", minProfitBps / 100, "%");

  // 保存部署信息
  const deploymentInfo = {
    network: hre.network.name,
    contract: "ArbitrageExecutor",
    address: contractAddress,
    owner,
    maxArbitrageAmount: maxArbitrageAmount.toString(),
    minProfitBps,
    dexRouters: dexConfigs,
    timestamp: new Date().toISOString(),
  };

  console.log("\nDeployment Info:", JSON.stringify(deploymentInfo, null, 2));

  // 等待区块确认（用于验证）
  console.log("\nWaiting for block confirmations...");
  await new Promise(resolve => setTimeout(resolve, 30000)); // 等待 30 秒

  // 尝试验证合约
  try {
    console.log("\nVerifying contract...");
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [owner, maxArbitrageAmount, minProfitBps],
    });
    console.log("Contract verified successfully!");
  } catch (error) {
    console.log("Verification failed (may need to wait longer):", (error as Error).message);
  }
}

// 如果直接运行脚本
if (require.main === module) {
  import("hardhat").then(({ default: hre }) => main(hre as unknown as HardhatRuntimeEnvironment));
}

export { main };
