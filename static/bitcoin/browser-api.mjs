import { analyzeCandles } from './lib/engine.mjs';
import { rulesAnalysis } from './lib/rules.mjs';
import { fetchCandles, demoCandles } from './lib/market.mjs';
import { getProfile, reviewExpiresAt } from './lib/profiles.mjs';

export function createBrowserAPI({ market = fetchCandles, storage = null, now = () => Math.floor(Date.now() / 1000) } = {}) {
  const cache = new Map();
  const status = (p) => ({ strategy:p.id, intervalMinutes:p.intervalMinutes, analysisMethod:'rules', reviewReady:true, aiConfigured:false, alertsConfigured:false, monitorEnabled:false, monitoringStrategies:[], running:false, model:null });
  return async function request(path, options = {}) {
    try {
      options.signal?.throwIfAborted();
      const url = new URL(path, 'https://dashboard.invalid');
      const body = options.body ? JSON.parse(options.body) : {};
      const p = getProfile(body.strategy || url.searchParams.get('strategy') || 'accumulation');
      if (url.pathname === '/api/status') return Response.json(status(p));
      if (url.pathname !== '/api/analyze') return Response.json({error:'Telegram monitoring is available in the desktop app.'}, {status:400});
      const mode = body.mode || url.searchParams.get('mode') || 'live';
      if (!['live','demo'].includes(mode)) throw new Error('Choose live or demo data.');
      let candles, fetchedAt = now();
      if (mode === 'demo') candles = demoCandles(now(), p.intervalSeconds);
      else {
        let entry = cache.get(p.id);
        if (!entry || now() - entry.fetchedAt >= p.marketCacheSeconds) {
          candles = await market({intervalMinutes:p.intervalMinutes});
          entry = {candles, fetchedAt:now()};
          cache.set(p.id, entry);
        }
        ({candles, fetchedAt} = entry);
      }
      options.signal?.throwIfAborted();
      const analysis = rulesAnalysis(await analyzeCandles(candles, {strategy:p.id, now:now(), demo:mode === 'demo'}), {demo:mode === 'demo'});
      if (mode === 'live' && analysis.reviewStatus === 'ready' && now() >= reviewExpiresAt(analysis,p)) {
        analysis.signal = 'UNAVAILABLE';
        analysis.reviewStatus = 'unavailable';
        analysis.score = null;
        analysis.summary = 'The completed market candle has expired. Refresh when the next candle is available.';
      }
      let history = [];
      const key = `satoshi-signal-history-v1:${p.id}`;
      if (mode === 'live') {
        try { const saved = JSON.parse(storage?.getItem(key) || '[]'); if (Array.isArray(saved)) history = saved.filter(item => item && typeof item === 'object').slice(0,100); } catch { /* Storage is optional. */ }
        if (options.method === 'POST' && body.runReview) {
          history.unshift({time:analysis.generatedAt, signal:analysis.signal, score:analysis.score, price:analysis.metrics.close, strategy:p.id, interval:p.intervalMinutes, mode, analysisMethod:'rules'});
          history = history.slice(0,100);
          try { storage?.setItem(key, JSON.stringify(history)); } catch { /* Private browsing may disable storage. */ }
        }
      }
      return Response.json({mode, strategy:p.id, analysisMethod:'rules', interval:p.intervalMinutes, source:mode === 'demo' ? 'Synthetic demonstration' : 'Kraken BTC/USD', fetchedAt, expiresAt:analysis.reviewStatus === 'ready' ? reviewExpiresAt(analysis,p) : null, analysis, history, status:status(p)});
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      return Response.json({error:error.message || 'Market data is unavailable.'}, {status:502});
    }
  };
}

// Accessing localStorage itself can throw in privacy-restricted browsers.
let storage;
try { storage = globalThis.localStorage; } catch { storage = null; }
export const browserRequest = createBrowserAPI({storage});
