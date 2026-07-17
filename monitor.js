const { ethers } = require('ethers');
const fs = require('fs');

const provider = new ethers.JsonRpcProvider('https://bnb-mainnet.g.alchemy.com/v2/yU_7sTSg_x8TMWQI36unf');

// ─── Tokens ───
const TOKENS = {
  WBNB:  { addr: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', dec: 18, stable: false, amount: '0.5' },
  USDT:  { addr: '0x55d398326f99059fF775485246999027B3197955', dec: 18, stable: true,  amount: '1000' },
  BUSD:  { addr: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', dec: 18, stable: true,  amount: '1000' },
  USDC:  { addr: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', dec: 18, stable: true,  amount: '1000' },
  CAKE:  { addr: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', dec: 18, stable: false, amount: '0.5' },
  ETH:   { addr: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', dec: 18, stable: false, amount: '0.5' },
  BTCB:  { addr: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', dec: 18, stable: false, amount: '0.5' },
  DOGE:  { addr: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', dec: 8,  stable: false, amount: '0.5' },
  ADA:   { addr: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47', dec: 18, stable: false, amount: '0.5' },
  XRP:   { addr: '0x1D2F0da169ceB9fC7B3144628dB156f3F6d60dBD', dec: 18, stable: false, amount: '0.5' },
  DOT:   { addr: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402', dec: 18, stable: false, amount: '0.5' },
  LINK:  { addr: '0xF8A0BF9cF54Bb92F4B7467a226B97C73e0eB82D5', dec: 18, stable: false, amount: '0.5' },
  MATIC: { addr: '0xCC42724C6683B7E57334c4E856f4c9965ED682bD', dec: 18, stable: false, amount: '0.5' },
  FTM:   { addr: '0xAD29AbB318791D57943D8f06113D8d4B58F32910', dec: 18, stable: false, amount: '0.5' },
  AVAX:  { addr: '0x1CE0c2827e2e14F5E1e2F9Ee8eE05C39F6C1C1c', dec: 18, stable: false, amount: '0.5' },
};

// ─── DEX Routers ───
const ROUTERS = {
  PCS:    { name: 'PCS',    router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', fee: 25 },
  Biswap: { name: 'Biswap', router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8', fee: 10 },
  Ape:    { name: 'Ape',    router: '0xcf0fEbD3F17cEF5b47D0f24c78Ad68a58C946a91', fee: 20 },
};

const routerAbi = ['function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'];
const routers = Object.fromEntries(Object.entries(ROUTERS).map(([k, v]) => [k, new ethers.Contract(v.router, routerAbi, provider)]));

const SIM_FILE = 'simulation_results.json';
const LOG_FILE = 'monitor.log';

function load(file) {
  try { return JSON.parse(fs.readFileSync(file)); }
  catch { return { startTime: Date.now(), simulations: [], totalProfit: '0', count: 0, totalGas: '0', bestRoi: '0', bestOpportunity: null, scanCount: 0, profitableScans: 0 }; }
}
function save(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
}

const sim = load(SIM_FILE);

// ─── Build all token pairs ───
const tokenList = Object.entries(TOKENS);
const pairs = [];
for (let i = 0; i < tokenList.length; i++) {
  for (let j = i + 1; j < tokenList.length; j++) {
    const [nameA, tA] = tokenList[i];
    const [nameB, tB] = tokenList[j];
    const amount = (tA.stable && tB.stable)
      ? ethers.parseUnits(tA.amount, 18)
      : ethers.parseEther(tA.amount);
    pairs.push({ a: tA.addr, b: tB.addr, nameA, nameB, amount, decA: tA.dec, decB: tB.dec });
  }
}

// ─── Direct arbitrage: A -> B on DEX1, B -> A on DEX2 ───
async function directArbitrage(pair) {
  const results = [];
  try {
    const dexNames = Object.keys(ROUTERS);
    
    // Get all A->B quotes in parallel
    const quotesAB = {};
    await Promise.all(dexNames.map(async (dex) => {
      try {
        const out = await routers[dex].getAmountsOut(pair.amount, [pair.a, pair.b]);
        quotesAB[dex] = out[1];
      } catch (e) { quotesAB[dex] = 0n; }
    }));

    // For each A->B, try all B->A (different DEX only)
    for (const buyDex of dexNames) {
      const amountB = quotesAB[buyDex];
      if (amountB === 0n) continue;

      for (const sellDex of dexNames) {
        if (buyDex === sellDex) continue;
        try {
          const out = await routers[sellDex].getAmountsOut(amountB, [pair.b, pair.a]);
          const amountA_back = out[1];
          const profit = amountA_back - pair.amount;

          // Gas: 180k @ 3 gwei = ~0.00054 BNB, plus execution overhead
          const gasCost = ethers.parseUnits('0.0006', 18);

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
  } catch (e) {}
  return results;
}

// ─── Triangular: A -> B -> C -> A on same DEX ───
async function triangularArbitrage(dexKey, tokenKeys) {
  const results = [];
  const dex = routers[dexKey];
  const tokens = tokenKeys.map(k => ({ key: k, ...TOKENS[k] }));

  for (let i = 0; i < tokens.length; i++) {
    for (let j = 0; j < tokens.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < tokens.length; k++) {
        if (k === i || k === j) continue;
        const A = tokens[i], B = tokens[j], C = tokens[k];
        const amountA = ethers.parseEther('0.3');

        try {
          const ab = await dex.getAmountsOut(amountA, [A.addr, B.addr]);
          const bc = await dex.getAmountsOut(ab[1], [B.addr, C.addr]);
          const ca = await dex.getAmountsOut(bc[1], [C.addr, A.addr]);

          const profit = ca[1] - amountA;
          const gasCost = ethers.parseUnits('0.001', 18); // 3 swaps = more gas

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

// ─── Multi-hop cross-DEX: A -> B -> C via different DEXes ───
async function multiHopArbitrage() {
  const results = [];
  const WBNB = TOKENS.WBNB.addr;
  const USDT = TOKENS.USDT.addr;
  const BUSD = TOKENS.BUSD.addr;
  const CAKE = TOKENS.CAKE.addr;
  
  const amount = ethers.parseEther('0.3');
  
  // Try: WBNB -> USDT (PCS) -> BUSD (Biswap) -> WBNB (PCS)
  try {
    const ab = await routers.PCS.getAmountsOut(amount, [WBNB, USDT]);
    const bc = await routers.Biswap.getAmountsOut(ab[1], [USDT, BUSD]);
    const ca = await routers.PCS.getAmountsOut(bc[1], [BUSD, WBNB]);
    
    const profit = ca[1] - amount;
    const gasCost = ethers.parseUnits('0.001', 18);
    if (profit > gasCost) {
      results.push({
        type: 'multihop',
        path: 'WBNB->USDT(PCS)->BUSD(Biswap)->WBNB(PCS)',
        netProfit: ethers.formatUnits(profit - gasCost, 18),
        roi: ((Number(profit - gasCost) * 100) / Number(amount)).toFixed(4),
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {}
  
  // Try: WBNB -> CAKE (PCS) -> USDT (Biswap) -> WBNB (PCS)
  try {
    const ab = await routers.PCS.getAmountsOut(amount, [WBNB, CAKE]);
    const bc = await routers.Biswap.getAmountsOut(ab[1], [CAKE, USDT]);
    const ca = await routers.PCS.getAmountsOut(bc[1], [USDT, WBNB]);
    
    const profit = ca[1] - amount;
    const gasCost = ethers.parseUnits('0.001', 18);
    if (profit > gasCost) {
      results.push({
        type: 'multihop',
        path: 'WBNB->CAKE(PCS)->USDT(Biswap)->WBNB(PCS)',
        netProfit: ethers.formatUnits(profit - gasCost, 18),
        roi: ((Number(profit - gasCost) * 100) / Number(amount)).toFixed(4),
        timestamp: new Date().toISOString()
      });
    }
  } catch (e) {}
  
  return results;
}

// ─── Main scan ───
async function scan() {
  sim.scanCount = (sim.scanCount || 0) + 1;
  
  log('═══════════════════════════════════════════════════');
  log(`🔍 Scan #${sim.scanCount} | ${pairs.length} pairs | 3 DEXes`);

  let found = 0;

  // Direct arbitrage on all pairs
  for (const pair of pairs) {
    const ops = await directArbitrage(pair);
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

  // Triangular on key volatile tokens (limit to reduce RPC calls)
  const volatileTokens = ['WBNB', 'CAKE', 'ETH', 'BTCB'];
  for (const dexKey of ['PCS', 'Biswap']) {
    const ops = await triangularArbitrage(dexKey, volatileTokens);
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

  // Multi-hop cross-DEX
  const multiOps = await multiHopArbitrage();
  for (const op of multiOps) {
    found++;
    log(`✅ MULTIHOP ${op.path} | Net: ${op.netProfit} | ROI: ${op.roi}%`);
    sim.simulations.push(op);
    sim.count = (sim.count || 0) + 1;

    const total = ethers.parseUnits(sim.totalProfit || '0', 18);
    const profit = ethers.parseUnits(op.netProfit, 18);
    sim.totalProfit = ethers.formatUnits(total + profit, 18);
  }

  if (found > 0) sim.profitableScans = (sim.profitableScans || 0) + 1;

  const elapsed = (Date.now() - sim.startTime) / 1000 / 60 / 60;
  log(`📊 Scan #${sim.scanCount} | Found: ${found} | Total ops: ${sim.count || 0} | Cumulative profit: ${sim.totalProfit || 0} BNB | Profitable scans: ${sim.profitableScans || 0}/${sim.scanCount} | Elapsed: ${elapsed.toFixed(2)}h / 168h`);

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

// ─── Start ───
log('🚀 7-Day Arbitrage Monitor Started');
log('Pairs: ' + pairs.length + ' | DEXes: ' + Object.keys(ROUTERS).length);
log('═══════════════════════════════════════════════════');

scan();
setInterval(scan, 60000); // Every 60 seconds

// Graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down...');
  save(SIM_FILE, sim);
  process.exit(0);
});
