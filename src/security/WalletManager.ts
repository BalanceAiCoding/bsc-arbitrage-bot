import { ethers } from "ethers";
import { logger } from "../utils/logger";

/**
 * 钱包管理器
 * 管理交易钱包，确保私钥安全
 */
export class WalletManager {
  private wallet: ethers.Wallet;
  private provider: ethers.Provider;
  private nonce: number = 0;
  private lastNonceTime: number = 0;

  constructor(privateKey: string, provider: ethers.Provider) {
    this.provider = provider;
    
    // 确保私钥格式正确
    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    this.wallet = new ethers.Wallet(formattedKey, provider);
    
    logger.info(`Wallet initialized`, { address: this.wallet.address });
  }

  /**
   * 获取钱包地址
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * 获取钱包实例
   */
  getWallet(): ethers.Wallet {
    return this.wallet;
  }

  /**
   * 获取 BNB 余额
   */
  async getBalance(): Promise<bigint> {
    return this.provider.getBalance(this.wallet.address);
  }

  /**
   * 获取代币余额
   */
  async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const erc20Abi = [
      "function balanceOf(address account) external view returns (uint256)",
      "function decimals() external view returns (uint8)",
    ];
    
    const token = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
    return token.balanceOf(this.wallet.address);
  }

  /**
   * 获取 nonce（带缓存）
   */
  async getNonce(): Promise<number> {
    const now = Date.now();
    
    // 每 30 秒刷新一次 nonce
    if (this.nonce === 0 || now - this.lastNonceTime > 30000) {
      this.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
      this.lastNonceTime = now;
    } else {
      this.nonce++;
    }
    
    return this.nonce;
  }

  /**
   * 重置 nonce
   */
  async resetNonce(): Promise<void> {
    this.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
    this.lastNonceTime = Date.now();
    logger.debug(`Nonce reset`, { nonce: this.nonce });
  }

  /**
   * 签名交易
   */
  async signTransaction(tx: ethers.TransactionRequest): Promise<string> {
    return this.wallet.signTransaction(tx);
  }

  /**
   * 发送交易
   */
  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    // 自动设置 nonce
    if (!tx.nonce) {
      tx.nonce = await this.getNonce();
    }
    
    return this.wallet.sendTransaction(tx);
  }

  /**
   * 检查是否有足够余额支付 gas
   */
  async hasEnoughGas(gasLimit: number = 500000, gasPriceGwei: number = 5): Promise<boolean> {
    const balance = await this.getBalance();
    const gasCost = ethers.parseUnits(gasPriceGwei.toString(), "gwei") * BigInt(gasLimit);
    return balance > gasCost;
  }

  /**
   * 获取钱包统计
   */
  async getStats(): Promise<{
    address: string;
    balance: string;
    nonce: number;
  }> {
    const balance = await this.getBalance();
    const nonce = await this.provider.getTransactionCount(this.wallet.address);
    
    return {
      address: this.wallet.address,
      balance: ethers.formatEther(balance),
      nonce,
    };
  }

  /**
   * 验证私钥格式
   */
  static isValidPrivateKey(key: string): boolean {
    try {
      const formatted = key.startsWith("0x") ? key : `0x${key}`;
      new ethers.Wallet(formatted);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 从助记词创建钱包
   */
  static fromMnemonic(mnemonic: string, provider?: ethers.Provider): ethers.Wallet {
    return ethers.Wallet.fromPhrase(mnemonic, undefined, provider);
  }
}
