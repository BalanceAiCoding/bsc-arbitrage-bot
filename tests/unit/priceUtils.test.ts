import { ethers } from "ethers";
import { calculateSwapOutput, calculatePrice, calculatePriceDiffBps, calculateMinAmountOut, formatAmount, parseAmount } from "../../src/utils/priceUtils";

describe("priceUtils", () => {
  describe("calculateSwapOutput", () => {
    it("should calculate correct output for CPMM", () => {
      const amountIn = ethers.parseEther("1");
      const reserveIn = ethers.parseEther("100");
      const reserveOut = ethers.parseEther("100");
      const feeBps = 25; // 0.25%

      const output = calculateSwapOutput(amountIn, reserveIn, reserveOut, feeBps);
      
      // 验证输出是合理的（小于输入，因为手续费）
      expect(output).toBeLessThan(amountIn);
      expect(output).toBeGreaterThan(BigInt(0));
    });

    it("should return 0 for zero input", () => {
      const output = calculateSwapOutput(BigInt(0), ethers.parseEther("100"), ethers.parseEther("100"), 25);
      expect(output).toBe(BigInt(0));
    });
  });

  describe("calculatePrice", () => {
    it("should calculate correct price", () => {
      const reserveIn = ethers.parseEther("100");
      const reserveOut = ethers.parseEther("200");

      const price = calculatePrice(reserveIn, reserveOut);
      
      expect(price).toBe(2); // 200 / 100 = 2
    });

    it("should handle equal reserves", () => {
      const reserveIn = ethers.parseEther("100");
      const reserveOut = ethers.parseEther("100");

      const price = calculatePrice(reserveIn, reserveOut);
      
      expect(price).toBe(1);
    });
  });

  describe("calculatePriceDiffBps", () => {
    it("should calculate correct difference in bps", () => {
      const price1 = 1.0;
      const price2 = 1.01; // 1% higher

      const diff = calculatePriceDiffBps(price1, price2);
      
      expect(diff).toBeCloseTo(100, 0); // 100 bps = 1%
    });

    it("should handle same price", () => {
      const diff = calculatePriceDiffBps(1.0, 1.0);
      expect(diff).toBe(0);
    });
  });

  describe("formatAmount", () => {
    it("should format BigNumber to string", () => {
      const amount = ethers.parseEther("1.5");
      const formatted = formatAmount(amount);
      
      expect(formatted).toBe("1.5");
    });
  });

  describe("parseAmount", () => {
    it("should parse string to BigNumber", () => {
      const parsed = parseAmount("1.5");
      
      expect(parsed).toBe(ethers.parseEther("1.5"));
    });
  });
});
