import { ethers } from "ethers";
import { estimateGasCost, gasCostToBnb, isGasPriceReasonable, formatGasPrice } from "../../src/utils/gasEstimator";
import { mockProvider } from "../setup";

describe("gasEstimator", () => {
  describe("estimateGasCost", () => {
    it("should estimate gas cost", async () => {
      const gasCost = await estimateGasCost(mockProvider, 300000);
      
      expect(gasCost).toBeDefined();
      expect(typeof gasCost).toBe("bigint");
      expect(gasCost).toBeGreaterThan(BigInt(0));
    });
  });

  describe("gasCostToBnb", () => {
    it("should convert gas cost to BNB", () => {
      const gasCost = ethers.parseUnits("0.001", "ether");
      const bnb = gasCostToBnb(gasCost);
      
      expect(bnb).toBe(0.001);
    });
  });

  describe("isGasPriceReasonable", () => {
    it("should return true for reasonable gas price", () => {
      const gasPrice = ethers.parseUnits("5", "gwei");
      const reasonable = isGasPriceReasonable(gasPrice);
      
      expect(reasonable).toBe(true);
    });

    it("should return false for too high gas price", () => {
      const gasPrice = ethers.parseUnits("25", "gwei");
      const reasonable = isGasPriceReasonable(gasPrice);
      
      expect(reasonable).toBe(false);
    });

    it("should return false for too low gas price", () => {
      const gasPrice = ethers.parseUnits("2", "gwei");
      const reasonable = isGasPriceReasonable(gasPrice);
      
      expect(reasonable).toBe(false);
    });
  });

  describe("formatGasPrice", () => {
    it("should format gas price with Gwei", () => {
      const gasPrice = ethers.parseUnits("5", "gwei");
      const formatted = formatGasPrice(gasPrice);
      
      expect(formatted).toContain("Gwei");
    });
  });
});
