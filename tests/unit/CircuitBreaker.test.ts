import { ethers } from "ethers";
import { CircuitBreaker } from "../../src/security/CircuitBreaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker();
  });

  describe("check", () => {
    it("should allow trading when not halted", async () => {
      const result = await breaker.check();
      expect(result).toBe(true);
    });

    it("should halt after too many consecutive losses", () => {
      // 模拟连续亏损
      breaker.recordExecution({ success: false });
      breaker.recordExecution({ success: false });
      breaker.recordExecution({ success: false });

      expect(breaker.isHalted()).toBe(true);
    });
  });

  describe("recordExecution", () => {
    it("should track consecutive losses", () => {
      breaker.recordExecution({ success: false });
      breaker.recordExecution({ success: false });
      
      expect(breaker.getStatus().consecutiveLosses).toBe(2);
    });

    it("should reset consecutive losses on profit", () => {
      breaker.recordExecution({ success: false });
      breaker.recordExecution({ success: false });
      breaker.recordExecution({ success: true, actualProfit: ethers.parseEther("0.01") });
      
      expect(breaker.getStatus().consecutiveLosses).toBe(0);
    });

    it("should halt on hourly loss threshold", () => {
      breaker.updatePortfolioValue(ethers.parseEther("10"));
      
      // 模拟超过 5% 的亏损
      breaker.recordExecution({ success: true, actualProfit: ethers.parseEther("-0.6") });
      
      expect(breaker.isHalted()).toBe(true);
    });
  });

  describe("manualHalt", () => {
    it("should halt when manually triggered", () => {
      expect(breaker.isHalted()).toBe(false);
      
      breaker.manualHalt("Emergency stop");
      
      expect(breaker.isHalted()).toBe(true);
      expect(breaker.getStatus().reason).toBe("Manual halt: Emergency stop");
    });
  });

  describe("reset", () => {
    it("should reset halted state", () => {
      breaker.manualHalt("Test");
      expect(breaker.isHalted()).toBe(true);
      
      breaker.reset();
      expect(breaker.isHalted()).toBe(false);
      expect(breaker.getStatus().consecutiveLosses).toBe(0);
    });
  });

  describe("getStatus", () => {
    it("should return correct status", () => {
      const status = breaker.getStatus();
      expect(status).toHaveProperty("halted");
      expect(status).toHaveProperty("reason");
      expect(status).toHaveProperty("consecutiveLosses");
      expect(status).toHaveProperty("haltDuration");
    });
  });
});
