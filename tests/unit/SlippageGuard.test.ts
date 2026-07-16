import { ethers } from "ethers";
import { SlippageGuard } from "../../src/security/SlippageGuard";
import { ArbitrageOpportunity } from "../../src/types";

describe("SlippageGuard", () => {
  let guard: SlippageGuard;

  beforeEach(() => {
    guard = new SlippageGuard();
  });

  const createOpportunity = (buyPrice: string, sellPrice: string): ArbitrageOpportunity => ({
    tokenA: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    tokenB: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    buyDex: "pancakeswap-v2",
    sellDex: "biswap",
    buyPrice: ethers.parseUnits(buyPrice, 18),
    sellPrice: ethers.parseUnits(sellPrice, 18),
    profitBps: 50,
    optimalAmount: ethers.parseEther("0.1"),
    expectedProfit: ethers.parseEther("0.005"),
    gasCost: ethers.parseEther("0.001"),
    netProfit: ethers.parseEther("0.004"),
    timestamp: Date.now(),
  });

  describe("check", () => {
    it("should allow normal slippage", async () => {
      const opportunity = createOpportunity("1", "1.005"); // 0.5% 价差
      const result = await guard.check(opportunity);
      expect(result).toBe(true);
    });

    it("should reject excessive slippage", async () => {
      const opportunity = createOpportunity("1", "1.05"); // 5% 价差
      const result = await guard.check(opportunity);
      expect(result).toBe(false);
    });
  });

  describe("calculateMinAmountOut", () => {
    it("should calculate correct min amount with default slippage", () => {
      const expectedAmount = ethers.parseEther("100");
      const minAmount = guard.calculateMinAmountOut(expectedAmount);
      
      // 100 * (10000 - 100) / 10000 = 99
      expect(minAmount).toBe(ethers.parseEther("99"));
    });

    it("should calculate correct min amount with custom slippage", () => {
      const expectedAmount = ethers.parseEther("100");
      const minAmount = guard.calculateMinAmountOut(expectedAmount, 50); // 0.5%
      
      // 100 * (10000 - 50) / 10000 = 99.5
      expect(minAmount).toBe(ethers.parseEther("99.5"));
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      const stats = guard.getStats();
      expect(stats).toHaveProperty("violations");
      expect(stats).toHaveProperty("isHalted");
    });
  });
});
