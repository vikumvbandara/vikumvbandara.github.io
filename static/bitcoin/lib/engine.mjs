/** Transparent research rules. Scores express rule alignment, never probability. */
import { getProfile } from './profiles.mjs';
import { BUY_THRESHOLD } from './thresholds.mjs';
export const STRATEGY_VERSION = 'btc-accumulation-evidence-v1.0.0';

const AGENTS = [
  { id: 'trend', name: 'Trend analyst', role: 'Measures the 50-day and 200-day trend as context for accumulation.', weight: 0.45 },
  { id: 'momentum', name: 'Momentum analyst', role: 'Checks near-term entry conditions within a longer-term accumulation plan.', weight: 0.30 },
  { id: 'participation', name: 'Volume analyst', role: 'Checks whether exchange trading volume supports the move.', weight: 0.25 },
  { id: 'risk', name: 'Risk manager', role: 'Can veto a buy when volatility or price extension is elevated.', weight: 0 },
];

const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = (value, places = 2) => Number(value.toFixed(places));
const sma = (values, period, end = values.length) => mean(values.slice(end - period, end));

function wilderAverage(values, period) {
  let average = mean(values.slice(0, period));
  for (let index = period; index < values.length; index++) {
    average = (average * (period - 1) + values[index]) / period;
  }
  return average;
}

function rsi14(closes) {
  const gains = [];
  const losses = [];
  for (let index = 1; index < closes.length; index++) {
    const change = closes[index] - closes[index - 1];
    gains.push(Math.max(change, 0));
    losses.push(Math.max(-change, 0));
  }
  const gain = wilderAverage(gains, 14);
  const loss = wilderAverage(losses, 14);
  if (gain === 0 && loss === 0) return 50;
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function emptyMetrics() {
  return { close: null, changePct: null, rsi: null, atrPct: null, sma20: null, sma50: null, sma200: null, volumeRatio: null };
}

function unavailable(summary, now, gates = [], candles = []) {
  return {
    signal: 'UNAVAILABLE', score: null, summary,
    agents: AGENTS.map(agent => ({
      ...agent, status: agent.id === 'risk' ? 'blocked' : 'neutral', score: null,
      summary: 'Waiting for a complete, valid market snapshot.', evidence: [],
    })),
    gates, technicalAgreement: null, metrics: emptyMetrics(), candles,
    lastClosedAt: null, generatedAt: now, strategyVersion: STRATEGY_VERSION,
  };
}

function vote(id, value, summary, evidence) {
  return {
    ...AGENTS.find(agent => agent.id === id),
    status: value > 0 ? 'bullish' : value < 0 ? 'bearish' : 'neutral',
    score: 50 + value * 50, summary, evidence,
  };
}

function trendAgent(context, profile) {
  const { close, sma50, sma200, previousSma50 } = context;
  if (profile.id === 'daytrade') {
    const bullish = close > context.sma20 && context.sma20 > sma50 && close > sma200 && sma50 > previousSma50;
    const bearish = close < sma50 && sma50 < previousSma50;
    return vote('trend', bullish ? 1 : bearish ? -1 : 0,
      bullish ? 'The 15-minute trend supports an intraday long setup.' : bearish ? 'The 15-minute trend is declining.' : 'Intraday trend checks are mixed.', [
        `Close ${round(close)}; SMA20 ${round(context.sma20)}; SMA50 ${round(sma50)}; SMA200 ${round(sma200)}.`,
        'All averages use 15-minute bars: SMA20 spans 5 hours, SMA50 12.5 hours, SMA200 50 hours.',
        'Bullish: close > SMA20 > SMA50, close > SMA200, and SMA50 rising over five bars (75 minutes).',
        'Bearish: close < SMA50 and SMA50 falling over five bars. Otherwise neutral.',
      ]);
  }
  const bullish = close > sma200 && sma50 > sma200 && sma50 > previousSma50;
  const bearish = close < sma200 && sma50 < previousSma50;
  return vote('trend', bullish ? 1 : bearish ? -1 : 0,
    bullish ? 'Price and the rising 50-bar average support an uptrend.'
      : bearish ? 'Price is below the 200-bar average and the 50-bar average is falling.'
        : 'Longer-term trend checks are mixed.', [
      `Close ${round(close)}; SMA50 ${round(sma50)}; SMA200 ${round(sma200)}.`,
      `SMA50 five bars ago ${round(previousSma50)}.`,
      'Bullish: close > SMA200, SMA50 > SMA200, and SMA50 rising over five bars.',
      'Bearish: close < SMA200 and SMA50 falling over five bars. Otherwise neutral.',
    ]);
}

function momentumAgent(context, profile) {
  const { rsi, roc10 } = context;
  if (profile.id === 'daytrade') {
    const bullish = rsi >= 50 && rsi <= 65 && roc10 > 0 && context.close > context.sma20;
    const bearish = rsi < 45 || roc10 < -0.5;
    return vote('momentum', bullish ? 1 : bearish ? -1 : 0,
      bullish ? 'Intraday momentum supports a long entry review without an extreme RSI.' : bearish ? 'Intraday momentum is weak.' : 'Intraday momentum does not meet the bullish rules.', [
        `Wilder RSI14 ${round(rsi)}; 10-bar (150-minute) price change ${round(roc10)}%.`,
        'Bullish: RSI14 from 50 through 65, positive 150-minute return, and close > SMA20.',
        'Bearish: RSI14 < 45 or 150-minute return < -0.5%. Otherwise neutral.',
      ]);
  }
  const bullish = rsi >= 45 && rsi <= 68 && roc10 > 0;
  const bearish = rsi < 40 || roc10 < -3;
  return vote('momentum', bullish ? 1 : bearish ? -1 : 0,
    bullish ? 'Recent gains have constructive momentum without an extreme RSI.'
      : bearish ? 'Recent momentum is weak.' : 'Momentum does not meet the bullish rules.', [
      `Wilder RSI14 ${round(rsi)}; 10-bar price change ${round(roc10)}%.`,
      'Bullish: RSI14 from 45 through 68 and 10-bar price change > 0%.',
      'Bearish: RSI14 < 40 or 10-bar price change < -3%. Otherwise neutral.',
    ]);
}

function participationAgent(context) {
  const { changePct, volumeRatio } = context;
  const bullish = changePct > 0 && volumeRatio >= 1.1;
  const bearish = changePct < 0 && volumeRatio >= 1.25;
  return vote('participation', bullish ? 1 : bearish ? -1 : 0,
    bullish ? 'An advancing candle has above-average trading volume.'
      : bearish ? 'A declining candle has elevated trading volume.'
        : 'Exchange volume provides no directional confirmation.', [
      `Latest close change ${round(changePct)}%; volume / prior 20-bar mean ${round(volumeRatio)}x.`,
      'Bullish: close rising and volume ratio >= 1.10x.',
      'Bearish: close falling and volume ratio >= 1.25x. Otherwise neutral.',
      'This is volume from one exchange, not the whole Bitcoin market.',
    ]);
}

function riskAgent(context, profile) {
  const { atrPct, changePct, extensionAtr, rsi, priorVolume } = context;
  const intraday = profile.id === 'daytrade';
  const maxAtr = intraday ? 1.5 : 6;
  const minReturn = intraday ? -2 : -6;
  const maxExtension = intraday ? 2 : 2.5;
  const maxRsi = intraday ? 72 : 75;
  const gates = [
    { name: 'Volatility', passed: atrPct <= maxAtr, detail: `ATR14 / close ${round(atrPct)}%; must be <= ${maxAtr}%.` },
    { name: 'Sudden decline', passed: changePct >= minReturn, detail: `Latest ${intraday ? '15-minute' : 'daily'} close change ${round(changePct)}%; must be >= ${minReturn}%.` },
    { name: 'Price extension', passed: extensionAtr <= maxExtension, detail: `Close is ${round(extensionAtr)} ATR above SMA20; must be <= ${maxExtension} ATR.` },
    { name: 'Overheated momentum', passed: rsi < maxRsi, detail: `RSI14 ${round(rsi)}; must be < ${maxRsi}.` },
    { name: 'Volume available', passed: priorVolume > 0, detail: `Prior 20-bar mean volume ${round(priorVolume, 4)} BTC; must be > 0.` },
  ];
  const failed = gates.filter(gate => !gate.passed);
  return {
    agent: {
      ...AGENTS.find(agent => agent.id === 'risk'), status: failed.length ? 'blocked' : 'pass', score: null,
      summary: failed.length ? `Buy blocked: ${failed.map(gate => gate.name.toLowerCase()).join(', ')}.`
        : 'All five risk checks pass; this does not establish that a trade is safe.',
      evidence: gates.map(gate => `${gate.passed ? 'Pass' : 'Blocked'}: ${gate.detail}`),
    }, gates,
  };
}

/**
 * Analyze only completed bars. The four modules share an immutable snapshot and
 * run independently; they are deterministic rule agents, not trained AI models.
 * BUY means technical eligibility for further AI review, not a final buy signal.
 */
export async function analyzeCandles(candles, options = {}) {
  let profile;
  try { profile = getProfile(options?.strategy ?? 'accumulation'); }
  catch {
    return { ...unavailable('Unknown strategy; no signal calculated.', Math.floor(Date.now() / 1000),
      [{ name:'Analysis settings', passed:false, detail:'Choose accumulation or daytrade.' }]),
      strategy:options?.strategy ?? null, intervalSeconds:null, intervalMinutes:null };
  }
  const result = await analyzeSnapshot(candles, options, profile);
  const intradayRoles = {
    trend:'Measures 15-minute trend alignment for an intraday long setup.',
    momentum:'Checks 15-minute momentum and near-term entry conditions.',
    participation:'Checks whether recent 15-minute exchange volume supports the move.',
    risk:'Can veto an intraday buy when 15-minute volatility or price extension is elevated.',
  };
  return { ...result, strategy:profile.id, intervalSeconds:profile.intervalSeconds, intervalMinutes:profile.intervalMinutes,
    strategyVersion:profile.id === 'daytrade' ? 'btc-daytrade-evidence-v1.0.0' : STRATEGY_VERSION,
    agents:result.agents.map(agent => profile.id === 'daytrade' ? {...agent,role:intradayRoles[agent.id] ?? agent.role} : agent) };
}

async function analyzeSnapshot(candles, options, profile) {
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const interval = options?.intervalSeconds ?? profile.intervalSeconds;
  const generatedAt = finite(now) ? now : Math.floor(Date.now() / 1000);
  const gates = [];
  try {
    if (!finite(now) || now < 0 || interval !== profile.intervalSeconds) {
      return unavailable('Invalid analysis time or candle interval.', generatedAt,
        [{ name: 'Analysis settings', passed: false, detail: `Time must be a nonnegative epoch timestamp. ${profile.label} requires ${profile.intervalMinutes}-minute candles (${profile.intervalSeconds} seconds).` }]);
    }
    if (!Array.isArray(candles) || candles.length === 0) {
      return unavailable('No market candles are available.', now,
        [{ name: 'Market data', passed: false, detail: 'A nonempty candle array is required.' }]);
    }
    if (candles.some(candle => !candle || !Number.isInteger(candle.time) || candle.time < 0)) {
      return unavailable('Market data contains an invalid candle timestamp.', now,
        [{ name: 'Valid timestamps', passed: false, detail: 'Every timestamp must be a nonnegative integer epoch second.' }]);
    }
    const closed = candles.filter(candle => candle.time + interval <= now)
      .map(({ time, open, high, low, close, volume }) => ({ time, open, high, low, close, volume }))
      .sort((left, right) => left.time - right.time);
    const valid = closed.every(candle =>
      ['open', 'high', 'low', 'close', 'volume'].every(field => finite(candle[field])) &&
      candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0 && candle.volume >= 0 &&
      candle.high >= Math.max(candle.open, candle.close, candle.low) &&
      candle.low <= Math.min(candle.open, candle.close));
    gates.push({ name: 'Valid closed candles', passed: valid,
      detail: valid ? 'Closed candles have finite positive prices, consistent OHLC ranges, and nonnegative volume.'
        : 'A closed candle has a missing, nonfinite, negative, or inconsistent value.' });
    if (!valid) return unavailable('Market data failed validation; no signal calculated.', now, gates);
    gates.push({ name: 'Completed history', passed: closed.length >= 220,
      detail: `${closed.length} completed bars; at least 220 required. ${candles.length - closed.length} open or future bars excluded.` });
    if (closed.length < 220) return unavailable('At least 220 completed candles are required.', now, gates, closed);
    const contiguous = closed.every((candle, index) => index === 0 || candle.time - closed[index - 1].time === interval);
    gates.push({ name: 'Continuous history', passed: contiguous,
      detail: contiguous ? 'No duplicate timestamps or gaps in the supplied completed history.'
        : 'Completed history contains duplicate timestamps or a missing interval.' });
    if (!contiguous) return unavailable('Market history has a gap or duplicate candle.', now, gates, closed);
    const lastClosedAt = closed.at(-1).time + interval;
    const grace = Math.min(600, interval / 10);
    const fresh = now - lastClosedAt <= interval + grace;
    gates.push({ name: 'Fresh data', passed: fresh,
      detail: `Latest candle closed ${round((now - lastClosedAt) / 60)} minutes ago; maximum age ${round((interval + grace) / 60)} minutes (one interval plus publishing grace).` });
    if (!fresh) return { ...unavailable('Latest completed candle is stale; refresh data before using a signal.', now, gates, closed), lastClosedAt };

    const closes = closed.map(candle => candle.close);
    const close = closes.at(-1);
    const trueRanges = closed.slice(1).map((candle, index) =>
      Math.max(candle.high - candle.low, Math.abs(candle.high - closes[index]), Math.abs(candle.low - closes[index])));
    const atr = wilderAverage(trueRanges, 14);
    const sma20 = sma(closes, 20);
    const priorVolume = mean(closed.slice(-21, -1).map(candle => candle.volume));
    const context = Object.freeze({
      close, changePct: (close / closes.at(-2) - 1) * 100,
      rsi: rsi14(closes), roc10: (close / closes.at(-11) - 1) * 100,
      atrPct: atr / close * 100, sma20, sma50: sma(closes, 50), sma200: sma(closes, 200),
      previousSma50: sma(closes, 50, closes.length - 5), priorVolume,
      volumeRatio: priorVolume > 0 ? closed.at(-1).volume / priorVolume : 0,
      extensionAtr: atr > 0 ? (close - sma20) / atr : 0,
    });
    if (Object.values(context).some(value => !finite(value))) {
      return unavailable('Indicators could not be calculated reliably.', now,
        [...gates, { name: 'Finite indicators', passed: false, detail: 'One or more calculated indicators are nonfinite.' }], closed);
    }
    const [trend, momentum, participation, risk] = await Promise.all([
      Promise.resolve().then(() => trendAgent(context, profile)),
      Promise.resolve().then(() => momentumAgent(context, profile)),
      Promise.resolve().then(() => participationAgent(context)),
      Promise.resolve().then(() => riskAgent(context, profile)),
    ]);
    const voters = [trend, momentum, participation];
    const score = round(voters.reduce((total, agent) => total + agent.score * agent.weight, 0), 1);
    const riskPass = risk.gates.every(gate => gate.passed);
    const qualifies = score >= BUY_THRESHOLD && trend.status === 'bullish' && momentum.status === 'bullish';
    const signal = riskPass && qualifies ? 'BUY' : riskPass && score >= 60 ? 'WATCH' : 'WAIT';
    const entry = profile.id === 'daytrade' ? '15-minute technical evidence supports reviewing an intraday long entry' : 'Daily technical evidence supports reviewing an accumulation entry';
    const summary = signal === 'BUY' ? `${entry}; AI review is still required.`
      : !riskPass ? 'A risk veto is active. The system is waiting for conditions to improve.'
        : signal === 'WATCH' ? `Some evidence supports ${profile.id === 'daytrade' ? 'an intraday long setup' : 'accumulation'}, but the technical entry conditions are not met.`
          : `${profile.id === 'daytrade' ? 'Intraday' : 'Daily'} technical evidence does not currently support ${profile.id === 'daytrade' ? 'a long entry' : 'an accumulation entry'}.`;
    return {
      signal, score, summary: `${options?.demo ? 'Demo data: ' : ''}${summary}`,
      agents: [...voters, risk.agent],
      gates: [...gates, ...risk.gates],
      technicalAgreement: { passed: qualifies,
        detail: `Technical alignment ${score}/100; the baseline prefers >= ${BUY_THRESHOLD} with bullish trend and momentum. This is evidence for AI review, not a hard gate or success probability.` },
      metrics: Object.fromEntries(Object.keys(emptyMetrics()).map(key => [key, context[key]])),
      candles: closed, lastClosedAt, generatedAt: now, strategyVersion: STRATEGY_VERSION,
    };
  } catch {
    return unavailable('Analysis failed safely; no signal is available.', generatedAt,
      [...gates, { name: 'Analysis completed', passed: false, detail: 'Unexpected data or calculation error.' }]);
  }
}
