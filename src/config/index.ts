import { ethers } from "ethers";

// BSC 网络配置
export const NETWORK_CONFIG = {
  chainId: 56,
  name: "BSC Mainnet",
  nativeCurrency: {
    name: "BNB",
    symbol: "BNB",
    decimals: 18,
  },
  rpc: {
    public: [
      "https://bsc-dataseed.binance.org",
      "https://bsc-dataseed1.defibit.io",
      "https://bsc-dataseed1.ninicoin.io",
      "https://rpc.ankr.com/bsc",
    ],
    private: process.env.PRIVATE_RPC_URL,
  },
  blockTime: 3000, // 3 秒
  confirmations: 1,
};

// DEX 配置
export const DEX_CONFIG = {
  pancakeswapV2: {
    name: "PancakeSwap V2",
    router: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
    factory: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    fee: 25, // 0.25% = 25 bps
  },
  pancakeswapV3: {
    name: "PancakeSwap V3",
    router: "0x13f4EA83D0bd40E75A625dE77ea94A78B5386F77",
    factory: "0x0BFbCF9faD4382C704F54B1640Ac21D6E5C3F2E5",
    fee: 5, // 0.05% = 5 bps (最低费率)
  },
  biswap: {
    name: "Biswap",
    router: "0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8",
    factory: "0x858E3312ed3A80C0EceF4bd0b0C8c17F38294e3f",
    fee: 10, // 0.1% = 10 bps
  },
  apeswap: {
    name: "ApeSwap",
    router: "0xC0788A3aD43d79aa53B09c2EaC8e0b3e3b7E3c8b",
    factory: "0x0841BD0B3E4d1E2dE57fE5D5F5F5F5F5F5F5F5F5", // 占位，需确认
    fee: 20, // 0.2% = 20 bps
  },
};

// 代币配置
export const TOKEN_CONFIG = {
  WBNB: {
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    symbol: "WBNB",
    decimals: 18,
    isStable: false,
  },
  BUSD: {
    address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    symbol: "BUSD",
    decimals: 18,
    isStable: true,
  },
  USDT: {
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    decimals: 18,
    isStable: true,
  },
  USDC: {
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    symbol: "USDC",
    decimals: 18,
    isStable: true,
  },
  CAKE: {
    address: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    symbol: "CAKE",
    decimals: 18,
    isStable: false,
  },
  ETH: {
    address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    symbol: "ETH",
    decimals: 18,
    isStable: false,
  },
  BTCB: {
    address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    symbol: "BTCB",
    decimals: 18,
    isStable: false,
  },
};

// 套利配置
export const ARBITRAGE_CONFIG = {
  minProfitBps: parseInt(process.env.MIN_PROFIT_BPS || "50"), // 0.5%
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || "3000"),
  gasPriceGwei: parseInt(process.env.GAS_PRICE_GWEI || "5"),
  gasLimit: parseInt(process.env.GAS_LIMIT || "500000"),
  maxSlippageBps: parseInt(process.env.MAX_SLIPPAGE_BPS || "100"), // 1%
  deadlineMinutes: 1,
};

// 安全配置
export const SECURITY_CONFIG = {
  maxSingleTxBnb: parseFloat(process.env.MAX_SINGLE_TX_BNB || "1.0"),
  maxDailySpendBnb: parseFloat(process.env.MAX_DAILY_SPEND_BNB || "5.0"),
  maxConsecutiveFailures: parseInt(process.env.MAX_CONSECUTIVE_FAILURES || "3"),
  maxHourlyLossPct: parseFloat(process.env.MAX_HOURLY_LOSS_PCT || "0.05"),
  maxDailyLossPct: parseFloat(process.env.MAX_DAILY_LOSS_PCT || "0.10"),
};

// 获取 Provider
export function getProvider(): ethers.JsonRpcProvider {
  const rpcUrl = process.env.PRIVATE_RPC_URL || NETWORK_CONFIG.rpc.public[0];
  return new ethers.JsonRpcProvider(rpcUrl, {
    name: NETWORK_CONFIG.name,
    chainId: NETWORK_CONFIG.chainId,
  });
}

// 获取 Wallet
export function getWallet(provider?: ethers.Provider): ethers.Wallet {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not set in environment");
  }
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (provider) {
    return new ethers.Wallet(formattedKey, provider);
  }
  return new ethers.Wallet(formattedKey);
}
