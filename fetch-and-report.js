#!/usr/bin/env node
/**
 * Market Data Fetcher + Research Pipeline — Yahoo Finance edition
 * No API key needed. Works from any IP (including GitHub Actions).
 * Usage:
 *   node fetch-and-report.js          → fetch data only, save data.json
 *   node fetch-and-report.js --report → fetch data + run 10-agent pipeline, save report.md
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════
// CONFIG
// ═══════════════════════════════════
const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY || '';
const BASE_DIR = __dirname;

// ═══════════════════════════════════
// SYMBOLS — Yahoo Finance tickers
// ═══════════════════════════════════
const SYMBOLS = {
  GOLD:   { yahoo: 'XAUUSD=X',  name: 'Gold Spot',  unit: 'USD/oz', digits: 2 },
  SILVER: { yahoo: 'XAGUSD=X',  name: 'Silver Spot',unit: 'USD/oz', digits: 2 },
  WTI:    { yahoo: 'CL=F',      name: 'WTI Crude',  unit: 'USD/bbl',digits: 2 },
  BRENT:  { yahoo: 'BZ=F',      name: 'Brent Crude',unit: 'USD/bbl',digits: 2 },
  COPPER: { yahoo: 'HG=F',      name: 'Copper',     unit: 'USD/lb', digits: 2 },
  BTC:    { yahoo: 'BTC-USD',   name: 'Bitcoin',    unit: 'USD',    digits: 0 },
  EURUSD: { yahoo: 'EURUSD=X',  name: 'EUR/USD',    unit: '',       digits: 4 },
  DXY:    { yahoo: 'DX-Y.NYB',  name: 'DXY',        unit: '',       digits: 2 },
  US10Y:  { yahoo: '^TNX',      name: 'US 10Y',     unit: '%',      digits: 2 },
  US3M:   { yahoo: '^IRX',      name: 'US 3M',      unit: '%',      digits: 2 },
};

// ═══════════════════════════════════
// YAHOO FINANCE FETCH
// ═══════════════════════════════════
async function yahooFetch(yahooSymbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url);
    if (!res.ok) { console.log(`  [HTTP ${res.status}] ${yahooSymbol}`); return null; }
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || !meta.regularMarketPrice) { console.log(`  [NULL] ${yahooSymbol}: no meta`); return null; }
    console.log(`  [OK] ${yahooSymbol}: ${meta.regularMarketPrice}`);
    return {
      price: meta.regularMarketPrice,
      high: meta.regularMarketDayHigh,
      low: meta.regularMarketDayLow,
      prevClose: meta.previousClose || meta.chartPreviousClose,
    };
  } catch (e) {
    console.log(`  [ERR] ${yahooSymbol}: ${e.message}`);
    return null;
  }
}

async function fetchAllData() {
  const results = {};
  const prices = {};
  const changes = {};

  for (const [key, cfg] of Object.entries(SYMBOLS)) {
    const data = await yahooFetch(cfg.yahoo);
    if (data && data.price > 0) {
      prices[key] = data.price;
      results[key] = { ...data, name: cfg.name, unit: cfg.unit, digits: cfg.digits };
      if (data.prevClose && data.prevClose > 0 && Math.abs(data.prevClose - data.price) > 0.0001) {
        changes[key] = {
          abs: data.price - data.prevClose,
          pct: ((data.price - data.prevClose) / data.prevClose) * 100,
        };
      }
    }
    // Rate limit: 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  // Derived
  if (prices.GOLD && prices.SILVER) {
    results._AUSR = { value: prices.GOLD / prices.SILVER, name: 'Gold/Silver Ratio' };
  }
  if (prices.US10Y && prices.US3M) {
    results._SPREAD = { value: (prices.US10Y - prices.US3M) * 100, name: '10Y-3M Spread', unit: 'bp' };
  }

  return { results, prices, changes, timestamp: new Date().toISOString() };
}

// ═══════════════════════════════════
// FEAR & GREED
// ═══════════════════════════════════
async function fetchFearGreed() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    const d = (await res.json()).data[0];
    return { value: parseInt(d.value), label: d.value_classification };
  } catch { return { value: 50, label: 'N/A' }; }
}

// ═══════════════════════════════════
// DEEPSEEK LLM CALL
// ═══════════════════════════════════
async function callLLM(systemPrompt, userMessage, temp = 0.3) {
  if (!DEEPSEEK_KEY) throw new Error('DEEPSEEK_KEY not set');
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', temperature: temp, max_tokens: 2048,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }] }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  return (await res.json()).choices[0].message.content;
}

// ═══════════════════════════════════
// 10-AGENT PIPELINE (unchanged)
// ═══════════════════════════════════
const ANALYSTS = {
  macro: {
    name:'宏观策略师',icon:'🌐',
    system:`你是资深宏观策略师。基于利率和汇率数据分析宏观经济环境。输出格式：## 宏观研判\n[分析]\n**关键结论**: [1句话]`,
    data:s=>`利率: US10Y ${s.us10y}% | US3M ${s.us3m}% | 利差 ${s.spread}bp\n外汇: DXY ${s.dxy} | EUR/USD ${s.eurusd}`,
  },
  energy:{
    name:'能源分析师',icon:'🛢️',
    system:`你是能源分析师。基于油价数据分析WTI-Brent价差、供需因素。输出格式：## 能源分析\n[分析]\n**关键结论**: [1句话]`,
    data:s=>`WTI: $${s.wti}/bbl | Brent: $${s.brent}/bbl | 价差: $${(s.brent-s.wti).toFixed(2)}`,
  },
  metals:{
    name:'贵金属策略师',icon:'🥇',
    system:`你是贵金属策略师。分析金价驱动因素和金银比。输出格式：## 贵金属分析\n[分析]\n**关键结论**: [1句话]`,
    data:s=>`黄金: $${s.gold} | 白银: $${s.silver} | 铂: $${s.plat} | 钯: $${s.pall}\n金银比: ${s.ausr}`,
  },
  quant:{
    name:'量化技术员',icon:'📈',
    system:`你是量化技术分析师。从价格推导趋势、支撑阻力位。输出格式：## 技术面\n| 品种 | 趋势 | 支撑 | 阻力 |\n|------|------|------|------|\n[填4-5行]\n**关键结论**: [1句话]`,
    data:s=>`WTI: $${s.wti} | Gold: $${s.gold} | Silver: $${s.silver} | DXY: ${s.dxy} | BTC: ${s.btc}`,
  },
  sentiment:{
    name:'情绪分析师',icon:'🎭',
    system:`你是市场情绪分析师。解读恐贪指数、金银比、利差。输出格式：## 情绪解读\n[分析]\n**关键结论**: [1句话]`,
    data:s=>`Fear & Greed: ${s.fng} (${s.fngLabel})\n金银比: ${s.ausr}\n10Y-3M利差: ${s.spread}bp (${s.spread<0?'倒挂⚠️':'正常'})`,
  },
  intel:{
    name:'情报分析师',icon:'🔎',
    system:`你是情报分析师。提炼今日最重要的3个市场主题。输出格式：## 情报整合\n### 主题1\n[分析]\n### 主题2\n[分析]\n### 主题3\n[分析]`,
    data:s=>`市场全景:\n利率: ${s.us10y}%/${s.us3m}% | 利差: ${s.spread}bp\nDXY: ${s.dxy} | EUR: ${s.eurusd}\nWTI: $${s.wti} | Brent: $${s.brent}\nGold: $${s.gold} | 金银比: ${s.ausr}\nBTC: ${s.btc}\nF&G: ${s.fng}\n提炼3个核心主题。`,
  },
};

const REVIEWERS = {
  factcheck:{ name:'事实核查',icon:'🔬',system:`你是事实核查员。对照原始数据检查分析师报告中的数字。输出格式：## 事实核查\n[✅通过 / ⚠️存疑 / ❌错误]`},
  consistency:{ name:'一致性审核',icon:'⚖️',system:`你是一致性审核员。检查分析师之间是否存在矛盾。输出格式：## 一致性审核\n[矛盾点或"观点一致"]`},
};

const EDITOR_SYSTEM = `你是研究主编。整合分析师报告和审核意见为最终市场日报。
输出格式：
## 📊 市场总览\n[3-4句话]
## 🔥 今日核心主题\n[3个主题]
## 🛢️ 能源\n[能源分析]
## 🥇 贵金属\n[贵金属分析]
## 📈 技术面\n[技术面表格]
## ⚠️ 风险信号\n[情绪+审核]
## 🎯 展望\n[1-2周方向判断+置信度]
规则：保留英文缩写，标注不确定为[需更多数据]，中文撰写。`;

async function runPipeline(data) {
  console.log('  Stage 1: Search...');
  const searchRes = await callLLM('你是金融搜索分析师。列出市场驱动因素。', `根据以下数据推断市场驱动因素：${JSON.stringify(data.prices)}`, 0.2);
  console.log('  Stage 1 ✓');

  console.log('  Stage 2: 6 analysts (parallel)...');
  const s = {
    us10y: data.prices.US10Y?.toFixed(2)||'N/A', us3m: data.prices.US3M?.toFixed(2)||'N/A',
    spread: data.results._SPREAD?.value?.toFixed(0)||'N/A',
    dxy: data.prices.DXY?.toFixed(2)||'N/A', eurusd: data.prices.EURUSD?.toFixed(4)||'N/A',
    gold: data.prices.GOLD?.toFixed(2)||'N/A', silver: data.prices.SILVER?.toFixed(2)||'N/A',
    plat: data.prices.PLAT?.toFixed(2)||'N/A', pall: data.prices.PALL?.toFixed(2)||'N/A',
    wti: data.prices.WTI?.toFixed(2)||'N/A', brent: data.prices.BRENT?.toFixed(2)||'N/A',
    btc: data.prices.BTC?Math.round(data.prices.BTC).toLocaleString():'N/A',
    ausr: data.results._AUSR?.value?.toFixed(1)||'N/A',
    fng: data.fng?.value||50, fngLabel: data.fng?.label||'N/A',
  };
  const analysisPromises = Object.entries(ANALYSTS).map(([key,a]) =>
    callLLM(a.system, a.data(s), 0.3).then(r=>({key,...a,report:r}))
  );
  const analysisResults = await Promise.all(analysisPromises);
  console.log('  Stage 2 ✓');

  console.log('  Stage 3: 2 reviewers...');
  const allReports = analysisResults.map(a=>`### ${a.icon} ${a.name}\n${a.report}`).join('\n\n---\n\n');
  const reviewData = `原始数据:\n${JSON.stringify(data.prices,null,2)}\n\n分析师报告:\n${allReports}`;
  const reviewResults = await Promise.all(Object.entries(REVIEWERS).map(([key,r])=>
    callLLM(r.system,reviewData,0.2).then(report=>({key,...r,report}))
  ));
  console.log('  Stage 3 ✓');

  console.log('  Stage 4: Editor...');
  const editorInput = `分析师报告:\n${allReports}\n\n审核意见:\n${reviewResults.map(r=>`### ${r.icon} ${r.name}\n${r.report}`).join('\n\n')}\n\n整合为最终市场日报。`;
  const finalReport = await callLLM(EDITOR_SYSTEM, editorInput, 0.35);
  console.log('  Stage 4 ✓');

  return { finalReport, analysisResults, reviewResults };
}

// ═══════════════════════════════════
// MAIN
// ═══════════════════════════════════
async function main() {
  const runReport = process.argv.includes('--report');
  console.log(`[${new Date().toISOString()}] Yahoo Finance fetch ${runReport?'+ report':''}`);

  console.log('Fetching data...');
  const data = await fetchAllData();
  data.fng = await fetchFearGreed();
  fs.writeFileSync(path.join(BASE_DIR,'data.json'), JSON.stringify(data,null,2));
  console.log(`data.json saved (${Object.keys(data.prices).length} symbols)`);

  if (runReport) {
    console.log('Running 10-agent pipeline...');
    try {
      const { finalReport, analysisResults, reviewResults } = await runPipeline(data);
      const now = new Date().toLocaleString('zh-CN',{hour12:false});
      const reportMd = `# 市场日报 · ${now}\n\n> 分析: ${analysisResults.map(a=>a.icon+a.name).join(' · ')}\n> 审核: ${reviewResults.map(r=>r.icon+r.name).join(' · ')}\n> 数据: Yahoo Finance + alternative.me\n\n---\n\n${finalReport}`;
      fs.writeFileSync(path.join(BASE_DIR,'report.md'), reportMd);
      fs.writeFileSync(path.join(BASE_DIR,'report.json'), JSON.stringify({
        timestamp: new Date().toISOString(), title:'市场日报',
        agents: analysisResults.map(a=>({icon:a.icon,name:a.name})),
        reviewers: reviewResults.map(r=>({icon:r.icon,name:r.name})),
        content: finalReport,
      }, null, 2));
      console.log('Report saved ✓');
    } catch(e) { console.error('Pipeline failed:', e.message); }
  }
  console.log('Done.');
}

main().catch(e=>{console.error(e);process.exit(1);});
