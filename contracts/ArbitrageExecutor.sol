// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ArbitrageExecutor
 * @notice BSC 链上套利执行合约，支持 Flash Loan
 * @dev 使用 PancakeSwap/Biswap 的 Flash Loan 进行套利
 */
contract ArbitrageExecutor is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ 状态变量 ============
    
    /// @notice 是否暂停
    bool public paused;
    
    /// @notice 最大单次套利金额
    uint256 public maxArbitrageAmount;
    
    /// @notice 最小利润要求（基点）
    uint256 public minProfitBps;
    
    /// @notice 紧急提现地址
    address public emergencyRecipient;
    
    /// @notice DEX 路由器地址
    mapping(string => address) public dexRouters;
    
    /// @notice 执行次数统计
    uint256 public totalExecutions;
    
    /// @notice 总利润统计
    uint256 public totalProfit;

    // ============ 事件 ============
    
    event ArbitrageExecuted(
        address indexed tokenA,
        address indexed tokenB,
        string buyDex,
        string sellDex,
        uint256 amountIn,
        uint256 profit,
        uint256 timestamp
    );
    
    event FlashLoanArbitrageExecuted(
        address indexed borrowToken,
        uint256 borrowAmount,
        uint256 profit,
        uint256 timestamp
    );
    
    event EmergencyWithdraw(
        address indexed token,
        uint256 amount,
        address indexed recipient
    );
    
    event DexRouterUpdated(string name, address router);

    // ============ 修饰符 ============
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    modifier validDex(string memory dexName) {
        require(dexRouters[dexName] != address(0), "Invalid DEX");
        _;
    }

    // ============ 构造函数 ============
    
    constructor(
        address _owner,
        uint256 _maxArbitrageAmount,
        uint256 _minProfitBps
    ) Ownable(_owner) {
        maxArbitrageAmount = _maxArbitrageAmount;
        minProfitBps = _minProfitBps;
        emergencyRecipient = _owner;
        paused = false;
    }

    // ============ 外部函数 ============
    
    /**
     * @notice 执行直接套利（使用合约余额）
     * @param tokenA 买入代币
     * @param tokenB 卖出代币
     * @param buyDex 买入 DEX
     * @param sellDex 卖出 DEX
     * @param amountIn 买入金额
     * @param amountOutMin 最小卖出金额
     */
    function executeArbitrage(
        address tokenA,
        address tokenB,
        string calldata buyDex,
        string calldata sellDex,
        uint256 amountIn,
        uint256 amountOutMin
    ) external onlyOwner whenNotPaused validDex(buyDex) validDex(sellDex) nonReentrant {
        require(amountIn <= maxArbitrageAmount, "Amount exceeds limit");
        require(tokenA != tokenB, "Same token");
        
        uint256 initialBalance = IERC20(tokenA).balanceOf(address(this));
        require(initialBalance >= amountIn, "Insufficient balance");
        
        // 1. 在 buyDex 买入 tokenB
        uint256 tokenBReceived = _swap(
            tokenA,
            tokenB,
            amountIn,
            0, // 不设置最小输出，由后续检查控制
            dexRouters[buyDex]
        );
        
        // 2. 在 sellDex 卖出 tokenB 换回 tokenA
        uint256 tokenAReceived = _swap(
            tokenB,
            tokenA,
            tokenBReceived,
            amountOutMin,
            dexRouters[sellDex]
        );
        
        // 3. 验证利润
        require(tokenAReceived > amountIn, "No profit");
        uint256 profit = tokenAReceived - amountIn;
        
        uint256 profitBps = (profit * 10000) / amountIn;
        require(profitBps >= minProfitBps, "Profit below minimum");
        
        // 更新统计
        totalExecutions++;
        totalProfit += profit;
        
        emit ArbitrageExecuted(
            tokenA,
            tokenB,
            buyDex,
            sellDex,
            amountIn,
            profit,
            block.timestamp
        );
    }
    
    /**
     * @notice 执行 Flash Loan 套利
     * @param flashLoanProvider Flash Loan 提供者地址
     * @param borrowToken 借入代币
     * @param borrowAmount 借入金额
     * @param tokenPath 交易路径
     * @param dexPath DEX 路径
     * @param data 额外数据
     */
    function executeFlashLoanArbitrage(
        address flashLoanProvider,
        address borrowToken,
        uint256 borrowAmount,
        address[] calldata tokenPath,
        string[] calldata dexPath,
        bytes calldata data
    ) external onlyOwner whenNotPaused nonReentrant {
        require(borrowAmount <= maxArbitrageAmount, "Amount exceeds limit");
        require(tokenPath.length >= 2, "Invalid path");
        require(dexPath.length == tokenPath.length - 1, "Path mismatch");
        
        // 记录初始余额
        uint256 initialBalance = IERC20(borrowToken).balanceOf(address(this));
        
        // 执行 Flash Loan（具体实现取决于 Flash Loan 提供者）
        // 这里使用简化的接口
        _executeFlashLoan(
            flashLoanProvider,
            borrowToken,
            borrowAmount,
            tokenPath,
            dexPath,
            data
        );
        
        // 验证还款和利润
        uint256 finalBalance = IERC20(borrowToken).balanceOf(address(this));
        require(finalBalance >= initialBalance, "Flash loan not repaid");
        
        uint256 profit = finalBalance - initialBalance;
        
        totalExecutions++;
        totalProfit += profit;
        
        emit FlashLoanArbitrageExecuted(
            borrowToken,
            borrowAmount,
            profit,
            block.timestamp
        );
    }
    
    /**
     * @notice 接收 Flash Loan 回调
     * @param sender 调用者
     * @param token 借入代币
     * @param amount 借入金额
     * @param fee 手续费
     * @param data 额外数据
     */
    function pancakeCall(
        address sender,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external nonReentrant {
        // 验证调用者
        require(sender == address(this), "Invalid sender");
        
        // 解码数据
        (address[] memory tokenPath, string[] memory dexPath) = abi.decode(data, (address[], string[]));
        
        // 执行套利交易
        _executeArbitragePath(tokenPath, dexPath);
        
        // 归还 Flash Loan + 手续费
        uint256 repayAmount = amount + fee;
        IERC20(tokenPath[0]).safeTransfer(msg.sender, repayAmount);
    }

    // ============ 内部函数 ============
    
    /**
     * @notice 执行代币交换
     */
    function _swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        address router
    ) internal returns (uint256 amountOut) {
        // 授权路由器
        IERC20(tokenIn).safeApprove(router, amountIn);
        
        // 构建路径
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        // 执行交换
        uint256[] memory amounts = IPancakeRouter(router).swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            address(this),
            block.timestamp + 300 // 5 分钟 deadline
        );
        
        amountOut = amounts[amounts.length - 1];
    }
    
    /**
     * @notice 执行 Flash Loan
     */
    function _executeFlashLoan(
        address provider,
        address token,
        uint256 amount,
        address[] calldata tokenPath,
        string[] calldata dexPath,
        bytes calldata data
    ) internal {
        // 编码回调数据
        bytes memory callbackData = abi.encode(tokenPath, dexPath);
        
        // 调用 Flash Loan
        IFlashLoanProvider(provider).flashLoan(
            address(this),
            amount,
            callbackData
        );
    }
    
    /**
     * @notice 执行套利路径
     */
    function _executeArbitragePath(
        address[] memory tokenPath,
        string[] memory dexPath
    ) internal {
        require(tokenPath.length >= 2, "Invalid path");
        require(dexPath.length == tokenPath.length - 1, "Path mismatch");
        
        uint256 amount = IERC20(tokenPath[0]).balanceOf(address(this));
        
        for (uint i = 0; i < dexPath.length; i++) {
            address router = dexRouters[dexPath[i]];
            require(router != address(0), "Invalid DEX in path");
            
            amount = _swap(
                tokenPath[i],
                tokenPath[i + 1],
                amount,
                0,
                router
            );
        }
    }

    // ============ 管理函数 ============
    
    /**
     * @notice 设置 DEX 路由器
     */
    function setDexRouter(string calldata name, address router) external onlyOwner {
        require(router != address(0), "Invalid router");
        dexRouters[name] = router;
        emit DexRouterUpdated(name, router);
    }
    
    /**
     * @notice 设置最大套利金额
     */
    function setMaxArbitrageAmount(uint256 amount) external onlyOwner {
        maxArbitrageAmount = amount;
    }
    
    /**
     * @notice 设置最小利润要求
     */
    function setMinProfitBps(uint256 bps) external onlyOwner {
        require(bps <= 10000, "Invalid bps");
        minProfitBps = bps;
    }
    
    /**
     * @notice 暂停合约
     */
    function pause() external onlyOwner {
        paused = true;
    }
    
    /**
     * @notice 恢复合约
     */
    function unpause() external onlyOwner {
        paused = false;
    }
    
    /**
     * @notice 紧急提现
     */
    function emergencyWithdraw(address token) external onlyOwner {
        uint256 balance;
        if (token == address(0)) {
            // BNB
            balance = address(this).balance;
            (bool success, ) = emergencyRecipient.call{value: balance}("");
            require(success, "Transfer failed");
        } else {
            // ERC20
            balance = IERC20(token).balanceOf(address(this));
            IERC20(token).safeTransfer(emergencyRecipient, balance);
        }
        
        emit EmergencyWithdraw(token, balance, emergencyRecipient);
    }
    
    /**
     * @notice 设置紧急提现地址
     */
    function setEmergencyRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "Invalid address");
        emergencyRecipient = recipient;
    }
    
    /**
     * @notice 接收 BNB
     */
    receive() external payable {}

    // ============ 视图函数 ============
    
    /**
     * @notice 获取合约统计
     */
    function getStats() external view returns (
        uint256 executions,
        uint256 profit,
        bool isPaused
    ) {
        return (totalExecutions, totalProfit, paused);
    }
}

// ============ 接口 ============

interface IPancakeRouter {
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
    
    function getAmountsOut(
        uint256 amountIn,
        address[] calldata path
    ) external view returns (uint256[] memory amounts);
}

interface IFlashLoanProvider {
    function flashLoan(
        address receiver,
        uint256 amount,
        bytes calldata data
    ) external;
}
