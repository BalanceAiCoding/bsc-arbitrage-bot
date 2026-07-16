import { ethers } from "ethers";
import { SpendLimitGuard } from "../../src/security/SpendLimitGuard";
import { ArbitrageOpportunity } from "../../src/types";

describe("SpendLimitGuard", () => {
  let guard: SpendLimitGuard;

  beforeEach(() => {
    guard = new SpendLimitGuard();
  });

  const createOpportunity = (amount: string): ArbitrageOpportunity => ({
    tokenA: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    tokenB: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    buyDex: "pancakeswap-v2",
    sellDex: "biswap",
    buyPrice: ethers.parseUnits("1", 18),
    sellPrice: ethers.parseUnits("1.01", 18),
    profitBps: 100,
    optimalAmount: ethers.parseEther(amount),
    expectedProfit: ethers.parseEther("0.01"),
    gasCost: ethers.parseEther("0.001"),
    netProfit: ethers.parseEther("0.009"),
    timestamp: Date.now(),
  });

  describe("check", () => {
    it("should allow transaction within limits", async () => {
      const opportunity = createOpportunity("0.5"); // 0.5 BNB
      const result = await guard.check(opportunity);
      expect(result).toBe(true);
    });

    it("should reject transaction exceeding single tx limit", async () => {
      const opportunity = createOpportunity("2"); // 2 BNB > 1 BNB limit
      const result = await guard.check(opportunity);
      expect(result).toBe(false);
    });

    it("should reject transaction exceeding daily limit", async () => {
      // 先记录一些支出
      guard.recordSpend(ethers.parseEther("4.5"));
      
      const opportunity = createOpportunity("0.6"); // 4.5 + 0.6 = 5.1 > 5 BNB limit
      const result = await guard.check(opportunity);
      expect(result).toBe(false);
    });
  });

  describe("recordExecution", () => {
    it("should reset consecutive failures on success", () => {
      guard.recordExecution({ success: false });
      guard.recordExecution({ success: false });
      expect(guard.getStats().consecutiveFailures).toBe(2);

      guard.recordExecution({ success: true, actualProfit: ethers.parseEther("0.01") });
      expect(guard.getStats().consecutiveFailures).toBe(0);
    });
  });

  describe("isHalted", () => {
    it("should be halted after too many consecutive failures", () => {
      expect(guard.isHalted()).toBe(false);
      
      guard.recordExecution({ success: false });
      guard.recordExecution({ success: false });
      guard.recordExecution({ success: false });
      
      expect(guard.isHalted()).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      const stats = guard.getStats();
      expect(stats).toHaveProperty("dailySpend");
      expect(stats).toHaveProperty("consecutiveFailures");
      expect(stats).toHaveProperty("isHalted");
    });
  });
});
