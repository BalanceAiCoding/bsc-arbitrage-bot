const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://bnb-mainnet.g.alchemy.com/v2/yU_7sTSg_x8TMWQI36unf');

const USDT = '0x55d398326f99059fF775485246999027B3197955';
const BUSD = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56';

const routerAbi = ['function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'];
const pcs = new ethers.Contract('0x10ED43C718714eb63d5aA57B78B54704E256024E', routerAbi, provider);
const biswap = new ethers.Contract('0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8', routerAbi, provider);

async function test() {
  const amount = ethers.parseUnits('1000', 18);
  
  console.log('Testing USDT/BUSD arbitrage simulation');
  console.log('═══════════════════════════════════════════════════');
  
  // Get quotes
  const pcsOut = await pcs.getAmountsOut(amount, [USDT, BUSD]);
  const biswapOut = await biswap.getAmountsOut(amount, [USDT, BUSD]);
  
  console.log('PCS: 1000 USDT ->', ethers.formatUnits(pcsOut[1], 18), 'BUSD');
  console.log('Biswap: 1000 USDT ->', ethers.formatUnits(biswapOut[1], 18), 'BUSD');
  
  // Determine buy/sell
  const buyRouter = pcsOut[1] < biswapOut[1] ? biswap : pcs;
  const sellRouter = pcsOut[1] < biswapOut[1] ? pcs : biswap;
  
  console.log('\nBuy on:', pcsOut[1] < biswapOut[1] ? 'Biswap' : 'PancakeSwap');
  console.log('Sell on:', pcsOut[1] < biswapOut[1] ? 'PancakeSwap' : 'Biswap');
  
  // Step 1: Buy BUSD
  const buyResult = await buyRouter.getAmountsOut(amount, [USDT, BUSD]);
  const busdReceived = buyResult[1];
  console.log('\nStep 1: Buy BUSD ->', ethers.formatUnits(busdReceived, 18), 'BUSD');
  
  // Step 2: Sell BUSD back to USDT
  const sellResult = await sellRouter.getAmountsOut(busdReceived, [BUSD, USDT]);
  const usdtReceived = sellResult[1];
  console.log('Step 2: Sell BUSD ->', ethers.formatUnits(usdtReceived, 18), 'USDT');
  
  // Calculate
  const profit = usdtReceived - amount;
  console.log('\nProfit:', ethers.formatUnits(profit, 18), 'USDT');
  console.log('Profit > 0:', profit > 0);
  
  const gas = ethers.parseUnits('0.02', 18);
  console.log('Gas:', ethers.formatUnits(gas, 18), 'USDT');
  console.log('Profit - Gas:', ethers.formatUnits(profit - gas, 18), 'USDT');
  console.log('Profitable:', profit > gas);
}

test().catch(console.error);
