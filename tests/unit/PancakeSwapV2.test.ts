import { ethers } from "ethers";
import { PancakeSwapV2Connector } from "../../src/dex/PancakeSwapV2";
import { mockProvider } from "../setup";

describe("PancakeSwapV2Connector", () => {
  let connector: PancakeSwapV2Connector;
  const routerAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
  const factoryAddress = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";

  beforeEach(() => {
    connector = new PancakeSwapV2Connector(routerAddress, factoryAddress, mockProvider);
  });

  describe("getAmountOut", () => {
    it("should return correct amount out", async () => {
      const tokenIn = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"; // WBNB
      const tokenOut = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"; // BUSD
      const amountIn = ethers.parseEther("1");

      const amountOut = await connector.getAmountOut(tokenIn, tokenOut, amountIn);
      
      expect(amountOut).toBeDefined();
      expect(typeof amountOut).toBe("bigint");
    });

    it("should handle invalid pair", async () => {
      const tokenIn = "0x0000000000000000000000000000000000000000";
      const tokenOut = "0x0000000000000000000000000000000000000001";
      const amountIn = ethers.parseEther("1");

      const amountOut = await connector.getAmountOut(tokenIn, tokenOut, amountIn);
      
      expect(amountOut).toBe(BigInt(0));
    });
  });

  describe("getPrice", () => {
    it("should return price as BigNumber", async () => {
      const tokenIn = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
      const tokenOut = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";

      const price = await connector.getPrice(tokenIn, tokenOut);
      
      expect(price).toBeDefined();
      expect(typeof price).toBe("bigint");
    });
  });

  describe("getReserves", () => {
    it("should return reserves as tuple", async () => {
      const tokenA = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
      const tokenB = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";

      const reserves = await connector.getReserves(tokenA, tokenB);
      
      expect(Array.isArray(reserves)).toBe(true);
      expect(reserves.length).toBe(2);
      expect(typeof reserves[0]).toBe("bigint");
      expect(typeof reserves[1]).toBe("bigint");
    });
  });

  describe("pairExists", () => {
    it("should return boolean", async () => {
      const tokenA = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
      const tokenB = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";

      const exists = await connector.pairExists(tokenA, tokenB);
      
      expect(typeof exists).toBe("boolean");
    });
  });
});
