import { ethers } from "ethers";

// 模拟 Provider
export const mockProvider = {
  getBalance: jest.fn().mockResolvedValue(ethers.parseEther("10")),
  getTransactionCount: jest.fn().mockResolvedValue(0),
  getFeeData: jest.fn().mockResolvedValue({
    gasPrice: ethers.parseUnits("5", "gwei"),
    maxFeePerGas: ethers.parseUnits("5", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
  }),
  getBlockNumber: jest.fn().mockResolvedValue(1000000),
  getNetwork: jest.fn().mockResolvedValue({ chainId: 56, name: "BSC" }),
  estimateGas: jest.fn().mockResolvedValue(BigInt(200000)),
  call: jest.fn().mockResolvedValue("0x"),
} as unknown as ethers.Provider;

// 模拟 Wallet
export const mockWallet = {
  address: "0x742d35Cc6634C0532925a3b8D4C9B569890FaC1c",
  getAddress: jest.fn().mockResolvedValue("0x742d35Cc6634C0532925a3b8D4C9B569890FaC1c"),
  signTransaction: jest.fn().mockResolvedValue("0xsigned"),
  sendTransaction: jest.fn().mockResolvedValue({
    hash: "0xtxhash",
    wait: jest.fn().mockResolvedValue({
      status: 1,
      gasUsed: BigInt(200000),
    }),
  }),
  provider: mockProvider,
} as unknown as ethers.Wallet;

// 重置所有 mock
export function resetMocks(): void {
  jest.clearAllMocks();
}
