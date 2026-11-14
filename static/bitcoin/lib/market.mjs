export const DAY = 86400;
export async function fetchCandles({ intervalMinutes = 1440, fetchImpl = fetch } = {}) {
  if (![1440,15].includes(intervalMinutes)) throw new Error('Choose daily or 15-minute Bitcoin candles.');
  let response;
  try {
    response = await fetchImpl(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=${intervalMinutes}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'SatoshiSignal/0.1' },
      signal: AbortSignal.timeout(20000),
    });
  } catch { throw new Error('Could not reach Kraken. Check your internet connection and try again.'); }
  if (!response.ok) throw new Error(`Kraken market data is unavailable (HTTP ${response.status}).`);
  let body;
  try { body = await response.json(); } catch { throw new Error('Kraken returned unreadable market data.'); }
  if (!Array.isArray(body.error) || body.error.length) throw new Error('Kraken reported a market data error.');
  const rows = body.result?.XXBTZUSD;
  if (!Array.isArray(rows) || rows.length < 2) throw new Error('Kraken returned no usable Bitcoin candle history.');
  // Kraken always includes the currently uncommitted final row, regardless of since.
  // Drop it unconditionally; the engine also independently validates close timestamps.
  return rows.slice(0, -1).map(row => {
    if (!Array.isArray(row) || row.length < 7) throw new Error('Kraken returned an invalid candle.');
    if ([0,1,2,3,4,6].some(i => !['string','number'].includes(typeof row[i]) || String(row[i]).trim() === '' || !Number.isFinite(Number(row[i])))) throw new Error('Kraken returned a missing or nonnumeric candle value.');
    return { time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[6]) };
  });
}

export function fetchDailyCandles({ fetchImpl = fetch } = {}) {
  return fetchCandles({ intervalMinutes:1440, fetchImpl });
}

export function demoCandles(now = Math.floor(Date.now() / 1000), intervalSeconds = DAY) {
  if (![DAY,900].includes(intervalSeconds)) throw new Error('Demo requires daily or 15-minute candles.');
  const intraday = intervalSeconds === 900;
  const end = Math.floor(now / intervalSeconds) * intervalSeconds;
  let prior = 42000;
  return Array.from({ length: 400 }, (_, i) => {
    const close = intraday ? 42000 + i * 3 + Math.sin(i / 18) * 120 + Math.sin(i / 3) * 40
      : 42000 + i * 70 + Math.sin(i / 18) * 2600 + Math.sin(i / 3) * 400;
    const spread = intraday ? .001 : .012;
    const candle = { time: end - (400 - i) * intervalSeconds, open: prior, high: Math.max(prior, close) * (1 + spread), low: Math.min(prior, close) * (1 - spread), close,
      volume: intraday ? 20 + 8 * Math.sin(i / 7) + (i > 393 ? 10 : 0) : 1800 + 400 * Math.sin(i / 7) + (i > 393 ? 500 : 0) };
    prior = close;
    return candle;
  });
}
