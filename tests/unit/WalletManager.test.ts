import { ethers } from "ethers";
import { WalletManager } from "../../src/security/WalletManager";
import { mockProvider } from "../setup";

describe("WalletManager", () => {
  let manager: WalletManager;
  const testPrivateKey = "0x".padEnd(66, "1"); // 有效的私钥格式

  beforeEach(() => {
    manager = new WalletManager(testPrivateKey, mockProvider);
  });

  describe("getAddress", () => {
    it("should return wallet address", () => {
      const address = manager.getAddress();
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe("getBalance", () => {
    it("should return BNB balance", async () => {
      const balance = await manager.getBalance();
      expect(balance).toBeDefined();
      expect(typeof balance).toBe("bigint");
    });
  });

  describe("hasEnoughGas", () => {
    it("should return true when balance is sufficient", async () => {
      const result = await manager.hasEnoughGas();
      expect(result).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return wallet stats", async () => {
      const stats = await manager.getStats();
      expect(stats).toHaveProperty("address");
      expect(stats).toHaveProperty("balance");
      expect(stats).toHaveProperty("nonce");
    });
  });

  describe("isValidPrivateKey", () => {
    it("should validate correct private key", () => {
      const valid = WalletManager.isValidPrivateKey(testPrivateKey);
      expect(valid).toBe(true);
    });

    it("should reject invalid private key", () => {
      const valid = WalletManager.isValidPrivateKey("invalid");
      expect(valid).toBe(false);
    });
  });

  describe("getNonce", () => {
    it("should return nonce", async () => {
      const nonce = await manager.getNonce();
      expect(typeof nonce).toBe("number");
      expect(nonce).toBeGreaterThanOrEqual(0);
    });
  });
});
