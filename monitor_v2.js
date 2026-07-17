const { ethers } = require('ethers');
const fs = require('fs');

const provider = new ethers.JsonRpcProvider('https://bnb-mainnet.g.alchemy.com/v2/yU_7sTSg_x8TMWQI36unf');

// ─── 主流代币 ───
const MAJOR = {
  WBNB:  { addr: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', dec: 18 },
  USDT:  { addr: '0x55d398326f99059fF775485246999027B3197955', dec: 18 },
  BUSD:  { addr: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', dec: 18 },
  USDC:  { addr: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', dec: 18 },
};

// ─── 新币/小币种/高波动币 (流动性较低，价差可能更大) ───
const ALT_TOKENS = {
  CAKE:   { addr: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', dec: 18 },
  ETH:    { addr: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', dec: 18 },
  BTCB:   { addr: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', dec: 18 },
  ADA:    { addr: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47', dec: 18 },
  XRP:    { addr: '0x1D2F0da169ceB9fC7B3144628dB156f3F6d60dBD', dec: 18 },
  DOT:    { addr: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402', dec: 18 },
  LINK:   { addr: '0xF8A0BF9cF54Bb92F4B7467a226B97C73e0eB82D5', dec: 18 },
  MATIC:  { addr: '0xCC42724C6683B7E57334c4E856f4c9965ED682bD', dec: 18 },
  FTM:    { addr: '0xAD29AbB318791D57943D8f06113D8d4B58F32910', dec: 18 },
  DOGE:   { addr: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', dec: 8  },
  SHIB:   { addr: '0x2859e4544C4bB039668a7dD5aE9a39e2f9C4B2A0', dec: 18 }, // 可能有误，需验证
  PEPE:   { addr: '0x25d887Ce7a35172C62FeBFD67a1856F20FaEf00C', dec: 18 }, // 可能有误
  FLOKI:  { addr: '0xfb5B838b6cfEEdC2873aB27866079AC55363D37E', dec: 18 },
  BABYDOGE: { addr: '0xc748673057861a797275CD8A068AbB95A902e8de', dec: 9 },
  SAFEMOON: { addr: '0x8076C74C5e3F5852037F31Ff0093Eeb8c8ADd8D3', dec: 9 },
  ELON:     { addr: '0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3', dec: 18 },
  KISHU:    { addr: '0x2A42b6896e4b75662155C0dF1C1e48aB4ad1B1C0', dec: 18 },
  AKITA:    { addr: '0xC13Ee4a54B0E67f6Ef2c8E1d0b5c7b1E6B2f6C8d', dec: 18 }, // 占位，需验证
  SQUID:    { addr: '0x87230146E138d3F296a9a77e497A2A83012e9BC5', dec: 18 }, // 占位
  // 更多BSC新币可以从CoinMarketCap或DexScreener获取
};

// ─── DEX Routers ───
const ROUTERS = {
  PCS:    { name: 'PCS',    router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', fee: 25 },
  Biswap: { name: 'Biswap', router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8', fee: 10 },
  Ape:    { name: 'Ape',    router: '0xcf0fEbD3F17cEF5b47D0f24c78Ad68a58C946a91', fee: 20 },
};

const routerAbi = ['function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'];
const routers = Object.fromEntries(Object.entries(ROUTERS).map(([k, v]) => [k, new ethers.Contract(v.router, routerAbi, provider)]));

const SIM_FILE = 'simulation_results_v2.json';
const LOG_FILE = 'monitor_v2.log';

function load(file) {
  try { return JSON.parse(fs.readFileSync(file)); }
  catch { return { startTime: Date.now(), simulations: [], totalProfit: '0', count: 0, scanCount: 0, profitableScans: 0, bestRoi: '0', bestOpportunity: null, liquidityErrors: 0 }; }
}
function save(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

const sim = load(SIM_FILE);

// ─── 构建交易对 ───
// 策略1: 主流币 vs 新币 (WBNB/CAKE, USDT/SHIB等)
// 策略2: 新币之间的对 (CAKE/FLOKI等)
const pairs = [];

// 主流币作为基础，对新币
for (const [baseName, base] of Object.entries(MAJOR)) {
  for (const [altName, alt] of Object.entries(ALT_TOKENS)) {
    // 基础金额: 主流币0.1-0.3 BNB等值，新币用更小金额测试
    const amount = baseName === 'WBNB' 
      ? ethers.parseEther('0.2')  // 0.2 BNB
      : baseName.includes('USD') 
        ? ethers.parseUnits('200', 18)  // 200 USDT/BUSD/USDC
        : ethers.parseEther('0.1');
    pairs.push({ a: base.addr, b: alt.addr, nameA: baseName, nameB: altName, amount, decA: base.dec, decB: alt.dec });
  }
}

// 新币之间的对 (减少数量，避免过多RPC调用)
const altList = Object.entries(ALT_TOKENS);
for (let i = 0; i < Math.min(altList.length, 8); i++) {
  for (let j = i + 1; j < Math.min(altList.length, 8); j++) {
    const [nameA, tA] = altList[i];
    const [nameB, tB] = altList[j];
    pairs.push({ a: tA.addr, b: tB.addr, nameA, nameB, amount: ethers.parseEther('0.1'), decA: tA.dec, decB: tB.dec });
  }
}

// ─── 直接套利: A -> B on DEX1, B -> A on DEX2 ───
async function directArbitrage(pair) {
  const results = [];
  try {
    const dexNames = Object.keys(ROUTERS);
    
    // 并行获取所有 A->B 报价
    const quotesAB = {};
    await Promise.all(dexNames.map(async (dex) => {
      try {
        const out = await routers[dex].getAmountsOut(pair.amount, [pair.a, pair.b]);
        quotesAB[dex] = out[1];
      } catch (e) { quotesAB[dex] = 0n; }
    }));

    // 检查是否有至少两个DEX有流动性
    const activeDexes = dexNames.filter(d => quotesAB[d] > 0n);
    if (activeDexes.length < 2) return results;

    for (const buyDex of activeDexes) {
      const amountB = quotesAB[buyDex];
      if (amountB === 0n) continue;

      for (const sellDex of activeDexes) {
        if (buyDex === sellDex) continue;
        try {
          const out = await routers[sellDex].getAmountsOut(amountB, [pair.b, pair.a]);
          const amountA_back = out[1];
          const profit = amountA_back - pair.amount;

          // 降低gas阈值，小币种允许更小的净利润
          const gasCost = ethers.parseUnits('0.0004', 18);

          if (profit > gasCost) {
            const netProfit = profit - gasCost;
            const roi = (Number(netProfit) * 100) / Number(pair.amount);
            results.push({
              type: 'direct',
              pair: `${pair.nameA}/${pair.nameB}`,
              buyDex: ROUTERS[buyDex].name,
              sellDex: ROUTERS[sellDex].name,
              amountIn: ethers.formatUnits(pair.amount, 18),
              grossProfit: ethers.formatUnits(profit, 18),
              netProfit: ethers.formatUnits(netProfit, 18),
              gasCost: ethers.formatUnits(gasCost, 18),
              roi: roi.toFixed(4),
              timestamp: new Date().toISOString()
            });
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    if (e.message && e.message.includes('INSUFFICIENT_LIQUIDITY')) {
      sim.liquidityErrors = (sim.liquidityErrors || 0) + 1;
    }
  }
  return results;
}

// ─── 三角套利: A -> B -> C -> A on same DEX (减少组合数) ───
async function triangularArbitrage(dexKey, tokenList) {
  const results = [];
  const dex = routers[dexKey];
  const tokens = tokenList.map(([k, v]) => ({ key: k, ...v }));

  // 只测试前6个token的组合，减少RPC调用
  const limited = tokens.slice(0, 6);
  
  for (let i = 0; i < limited.length; i++) {
    for (let j = 0; j < limited.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < limited.length; k++) {
        if (k === i || k === j) continue;
        const A = limited[i], B = limited[j], C = limited[k];
        const amountA = ethers.parseEther('0.15');

        try {
          const ab = await dex.getAmountsOut(amountA, [A.addr, B.addr]);
          const bc = await dex.getAmountsOut(ab[1], [B.addr, C.addr]);
          const ca = await dex.getAmountsOut(bc[1], [C.addr, A.addr]);

          const profit = ca[1] - amountA;
          const gasCost = ethers.parseUnits('0.0008', 18);

          if (profit > gasCost) {
            const netProfit = profit - gasCost;
            const roi = (Number(netProfit) * 100) / Number(amountA);
            results.push({
              type: 'triangular',
              path: `${A.key} -> ${B.key} -> ${C.key} -> ${A.key}`,
              dex: ROUTERS[dexKey].name,
              amountIn: ethers.formatUnits(amountA, 18),
              netProfit: ethers.formatUnits(netProfit, 18),
              gasCost: ethers.formatUnits(gasCost, 18),
              roi: roi.toFixed(4),
              timestamp: new Date().toISOString()
            });
          }
        } catch (e) {}
      }
    }
  }
  return results;
}

// ─── 主扫描 ───
async function scan() {
  sim.scanCount = (sim.scanCount || 0) + 1;
  
  log('═══════════════════════════════════════════════════');
  log(`🔍 Scan #${sim.scanCount} | ${pairs.length} pairs | 3 DEXes | ALT-focused`);

  let found = 0;

  // 直接套利 - 分批扫描避免RPC限制
  const batchSize = 10;
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(p => directArbitrage(p)));
    
    for (const ops of batchResults) {
      for (const op of ops) {
        found++;
        log(`✅ DIRECT  ${op.pair} | ${op.buyDex} -> ${op.sellDex} | Net: ${op.netProfit} | ROI: ${op.roi}%`);
        sim.simulations.push(op);
        sim.count = (sim.count || 0) + 1;

        const total = ethers.parseUnits(sim.totalProfit || '0', 18);
        const profit = ethers.parseUnits(op.netProfit, 18);
        sim.totalProfit = ethers.formatUnits(total + profit, 18);

        if (!sim.bestOpportunity || parseFloat(op.roi) > parseFloat(sim.bestRoi || 0)) {
          sim.bestRoi = op.roi;
          sim.bestOpportunity = op;
        }
      }
    }
    
    // 小延迟避免触发RPC限流
    if (i + batchSize < pairs.length) await new Promise(r => setTimeout(r, 500));
  }

  // 三角套利 - 只在主流DEX上测试
  const triTokens = Object.entries(ALT_TOKENS).slice(0, 6);
  for (const dexKey of ['PCS', 'Biswap']) {
    const ops = await triangularArbitrage(dexKey, triTokens);
    for (const op of ops) {
      found++;
      log(`✅ TRIANGLE ${op.path} on ${op.dex} | Net: ${op.netProfit} | ROI: ${op.roi}%`);
      sim.simulations.push(op);
      sim.count = (sim.count || 0) + 1;

      const total = ethers.parseUnits(sim.totalProfit || '0', 18);
      const profit = ethers.parseUnits(op.netProfit, 18);
      sim.totalProfit = ethers.formatUnits(total + profit, 18);

      if (!sim.bestOpportunity || parseFloat(op.roi) > parseFloat(sim.bestRoi || 0)) {
        sim.bestRoi = op.roi;
        sim.bestOpportunity = op;
      }
    }
  }

  if (found > 0) sim.profitableScans = (sim.profitableScans || 0) + 1;

  const elapsed = (Date.now() - sim.startTime) / 1000 / 60 / 60;
  log(`📊 Scan #${sim.scanCount} | Found: ${found} | Total ops: ${sim.count || 0} | Cumulative: ${sim.totalProfit || 0} BNB | Profitable scans: ${sim.profitableScans || 0}/${sim.scanCount} | Liquidity errors: ${sim.liquidityErrors || 0} | Elapsed: ${elapsed.toFixed(2)}h / 168h`);

  save(SIM_FILE, sim);

  if (elapsed >= 168) {
    log('🎉 7 DAYS COMPLETE!');
    log(`Total scans: ${sim.scanCount}`);
    log(`Total opportunities: ${sim.count || 0}`);
    log(`Profitable scans: ${sim.profitableScans || 0}`);
    log(`Total simulated profit: ${sim.totalProfit || 0} BNB`);
    if (sim.bestOpportunity) {
      log(`Best opportunity: ${JSON.stringify(sim.bestOpportunity)}`);
    }
    process.exit(0);
  }
}

// ─── 启动 ───
log('🚀 ALT-Token Arbitrage Monitor Started');
log(`Pairs: ${pairs.length} | DEXes: ${Object.keys(ROUTERS).length} | Focus: New/Alt tokens`);
log('═══════════════════════════════════════════════════');

scan();
setInterval(scan, 120000); // 每2分钟扫描一次（减少RPC使用，增加扫描范围）

process.on('SIGINT', () => {
  log('Shutting down...');
  save(SIM_FILE, sim);
  process.exit(0);
});
