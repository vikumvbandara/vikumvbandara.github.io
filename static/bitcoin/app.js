import { browserRequest as fetch } from './browser-api.mjs';
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const profiles = {
    accumulation: { name: 'Long-term accumulation', interval: 1440, candle: 'daily', refreshMs: 300000, monitoring: 'Daily', cadence: 'daily' },
    daytrade: { name: 'Day trading', interval: 15, candle: '15-minute', refreshMs: 60000, monitoring: 'Day trading', cadence: 'every 15 minutes' },
  };
  const state = { mode: 'live', strategy: 'accumulation', interval: 1440, analysisMethod: 'rules', payload: null, loading: false, manualReview: false, request: 0, statusRequest: 0, controller: null, nextRefresh: null, lastChecked: null, status: null, setupBusy: false, expiryTimer: null };
  const profile = () => profiles[state.strategy];
  const isRules = () => state.analysisMethod === 'rules';
  const reviewReady = () => state.status?.reviewReady ?? (isRules() || !!state.status?.aiConfigured);
  const money = (value, digits = 0) => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value) : '—';
  const number = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (seconds, options = {}) => Number.isFinite(seconds) ? new Date(seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', ...options }) : '—';
  const setText = (id, value) => { $(id).textContent = value; };
  const signalNames = { BUY: 'Buy setup', WATCH: 'Watch closely', WAIT: 'Wait for a setup', UNAVAILABLE: 'Signal unavailable' };
  const signalIcons = { BUY: '↗', WATCH: '◎', WAIT: 'Ⅱ', UNAVAILABLE: '○' };
  const allowedSignals = new Set(Object.keys(signalNames));
  const statuses = new Set(['bullish', 'neutral', 'bearish', 'pass', 'blocked']);

  function connection(text, status) {
    setText('connection-text', text);
    $('connection').dataset.state = status;
  }

  function setLoading(loading) {
    state.loading = loading;
    $('overview').setAttribute('aria-busy', String(loading));
    $('analyze').disabled = loading || (state.mode === 'live' && (!reviewReady() || !!state.status?.running));
    $('analyze').classList.toggle('loading', loading);
    setText('analyze-label', loading ? state.manualReview ? isRules() ? 'Analyzing…' : 'AI reviewing…' : 'Loading view…' : state.mode === 'demo' ? 'Refresh demo' : isRules() ? 'Run analysis' : 'Run AI review');
    for (const id of ['live-mode', 'demo-mode', 'strategy']) $(id).disabled = loading && state.manualReview;
    $('download').disabled = loading || !state.payload;
  }

  function clearAnalysis(loading = false) {
    clearTimeout(state.expiryTimer);
    state.expiryTimer = null;
    state.payload = null;
    document.querySelector('.signal-panel').dataset.signal = 'UNAVAILABLE';
    setText('signal-title', loading ? 'Reading the market' : 'Signal unavailable');
    setText('signal-icon', loading ? '◎' : '○');
    setText('signal-summary', loading ? isRules() ? `Loading completed ${profile().candle} candles and evaluating trend, momentum, participation, and risk.` : state.manualReview ? 'Researching current developments, then gathering two independent opinions and a separate risk review. This can take several minutes.' : `Loading completed ${profile().candle} candles and the latest available AI review.` : 'A new analysis needs usable market data. Try again or explore the clearly labeled demo.');
    $('agreement-value').innerHTML = '—<span> / 100</span>';
    $('agreement-fill').style.width = '0%';
    $('agreement-meter').removeAttribute('aria-valuenow');
    $('agreement-meter').setAttribute('aria-valuetext', 'Not available');
    setText('signal-footnote', loading ? 'The previous signal is cleared while the new review runs.' : 'No current buy signal is available.');
    for (const id of ['price', 'price-change', 'rsi-value', 'trend-value', 'volume-value', 'atr-value']) setText(id, '—');
    $('price-change').className = 'price-change';
    setText('rsi-detail', loading ? 'Waiting for analysis' : 'Data unavailable');
    setText('trend-detail', loading ? 'Waiting for analysis' : 'Data unavailable');
    setText('closed-time', 'Completed candle: —');
    setText('expiry-time', 'Review expires: —');
    setText('source-label', loading ? 'Source: connecting' : 'Source: unavailable');
    setText('chart-range', `Last 120 completed ${profile().candle} candles`);
    setText('version-label', `${profile().name} · Unvalidated research`);
    setText('gates-count', loading ? 'PENDING' : 'UNAVAILABLE');
    $('price-chart').innerHTML = `<div class="chart-empty">${loading ? 'Loading completed candles…' : 'Market data is unavailable'}</div>`;
    $('agents-grid').innerHTML = `<div class="empty-panel">${loading ? 'The research team is reviewing the data…' : 'Agent findings will appear when a valid analysis is available.'}</div>`;
    $('gates-list').innerHTML = `<p class="empty-copy">${loading ? 'Checking data quality and risk…' : 'A complete data review is required.'}</p>`;
    $('history-body').innerHTML = '<tr><td colspan="4" class="table-empty">No current results to display.</td></tr>';
    setText('research-summary', loading ? 'Research will appear when the AI review is available.' : 'No current research is available.');
    setText('research-date', 'AWAITING REVIEW');
    $('research-sources').replaceChildren();
    $('market-agents').innerHTML = '<p class="empty-copy">Waiting for measured market evidence.</p>';
    $('download').disabled = true;
  }

  function renderChart(candles) {
    const all = Array.isArray(candles) ? candles.filter(c => Number.isFinite(c.time) && Number.isFinite(c.close) && c.close > 0) : [];
    const sliceStart = Math.max(0, all.length - 120);
    const points = all.slice(sliceStart);
    if (points.length < 2) {
      $('price-chart').innerHTML = '<div class="chart-empty">Not enough completed candles to chart</div>';
      return;
    }
    const averages = points.map((_, i) => {
      const end = sliceStart + i;
      return end >= 49 ? all.slice(end - 49, end + 1).reduce((sum, c) => sum + c.close, 0) / 50 : null;
    });
    const values = [...points.map(c => c.close), ...averages.filter(Number.isFinite)];
    const min = Math.min(...values), max = Math.max(...values);
    const padding = Math.max((max - min) * .15, max * .005);
    const lo = min - padding, hi = max + padding;
    const w = 680, h = 220, left = 3, right = 65, top = 14, bottom = 27;
    const x = i => left + i * (w - left - right) / (points.length - 1);
    const y = v => top + (hi - v) * (h - top - bottom) / (hi - lo);
    const line = points.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(c.close).toFixed(2)}`).join(' ');
    let begun = false;
    const averageLine = averages.map((v, i) => {
      if (!Number.isFinite(v)) return '';
      const result = `${begun ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`;
      begun = true;
      return result;
    }).join(' ');
    const grid = [0, 1, 2, 3].map(i => {
      const v = hi - (hi - lo) * i / 3;
      return `<line x1="0" y1="${y(v)}" x2="${w - right + 3}" y2="${y(v)}" stroke="#293242" stroke-width=".7" stroke-dasharray="3 5"/><text x="${w - right + 13}" y="${y(v) + 3}" fill="#8291a6" font-size="9">${escape(money(v))}</text>`;
    }).join('');
    const indices = [0, Math.floor((points.length - 1) / 3), Math.floor(2 * (points.length - 1) / 3), points.length - 1];
    const dates = indices.map((i, index) => `<text x="${x(i)}" y="${h - 5}" fill="#788aa3" font-size="9" text-anchor="${index === 0 ? 'start' : index === 3 ? 'end' : 'middle'}">${escape(new Date(points[i].time * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', ...(state.strategy === 'daytrade' ? { hour: 'numeric', minute: '2-digit' } : {}) }))}</text>`).join('');
    const last = points.at(-1);
    $('price-chart').innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="chart-title chart-description"><title id="chart-title">Bitcoin completed-candle closing prices</title><desc id="chart-description">${escape(`${points.length} completed candles from ${date(points[0].time)} to ${date(last.time)}. Final close ${money(last.close, 2)}. Orange is price; blue-gray is the 50-bar moving average. ${state.mode === 'demo' ? 'Synthetic demonstration data.' : ''}`)}</desc><defs><linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f8a35e" stop-opacity=".15"/><stop offset="100%" stop-color="#f8a35e" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${line} L${x(points.length - 1)},${h - bottom} L${x(0)},${h - bottom} Z" fill="url(#price-fill)"/><path d="${averageLine}" fill="none" stroke="#738aa7" stroke-width="1.4" stroke-dasharray="5 4"/><path d="${line}" fill="none" stroke="#ffae68" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(points.length - 1)}" cy="${y(last.close)}" r="3.5" fill="#ffae68" stroke="#131924" stroke-width="1.5"/>${dates}</svg>`;
    setText('chart-range', `Last ${points.length} completed ${profile().candle} candles`);
  }

  function renderAgents(agents) {
    if (!Array.isArray(agents) || !agents.length) {
      $('agents-grid').innerHTML = '<div class="empty-panel">Agent analysis requires complete, usable market data.</div>';
      return;
    }
    const icons = { trend: '↗', momentum: '∿', participation: '▥', volume: '▥', risk: '◇', 'risk-manager': '◇', 'ai-cycle': '↗', 'ai-value': '◎', 'ai-risk': '◇' };
    $('agents-grid').innerHTML = agents.map((agent, i) => {
      const status = statuses.has(agent.status) ? agent.status : 'neutral';
      const evidence = Array.isArray(agent.evidence) ? agent.evidence : [];
      return `<article class="agent-card"><div class="agent-top"><span class="agent-symbol" aria-hidden="true">${icons[agent.id] || ['↗', '∿', '▥', '◇'][i % 4]}</span><span class="agent-status ${status}">${escape(status === 'pass' ? 'Risk clear' : status === 'blocked' ? isRules() ? 'Blocked' : 'Pending' : status)}</span></div><h3>${escape(agent.name)}</h3><p class="agent-role">${escape(agent.role)}${!isRules() && agent.model ? ` · ${escape(agent.model)}` : ''}</p><p class="agent-summary">${escape(agent.summary)}</p><div class="agent-bottom"><span>${Number.isFinite(agent.weight) && agent.weight > 0 ? `${Math.round(agent.weight * 100)}% of weighted vote` : 'Independent veto'}</span><strong>${Number.isFinite(agent.score) ? number(agent.score, 0) + '<span class="muted"> /100</span>' : status === 'pass' ? '✓' : '—'}</strong></div>${evidence.length ? `<details class="agent-evidence"><summary>Inspect the evidence</summary><ul>${evidence.map(item => `<li>${escape(item)}</li>`).join('')}</ul></details>` : ''}</article>`;
    }).join('');
  }

  function renderGates(gates) {
    const items = Array.isArray(gates) ? gates : [];
    setText('gates-count', items.length ? `${items.filter(g => g.passed).length} / ${items.length} CLEAR` : 'UNAVAILABLE');
    $('gates-list').innerHTML = items.length ? items.map(gate => `<div class="gate-row ${gate.passed ? '' : 'failed'}"><span class="gate-icon" aria-label="${gate.passed ? 'Passed' : 'Failed'}">${gate.passed ? '✓' : '!'}</span><div><p class="gate-name">${escape(gate.name)}</p><p class="gate-detail">${escape(gate.detail)}</p></div></div>`).join('') : '<p class="empty-copy">No data or risk checks are available.</p>';
  }

  function renderHistory(history) {
    const items = state.mode === 'live' && Array.isArray(history) ? history.filter(item => (item.strategy || 'accumulation') === state.strategy && (!item.analysisMethod || item.analysisMethod === state.analysisMethod) && (!item.interval || Number(item.interval) === state.interval) && (!item.mode || item.mode === state.mode)).slice(0, 6) : [];
    setText('history-caption', `${state.mode === 'demo' ? 'Synthetic demo' : isRules() ? 'Free rules' : 'AI reviews'} · ${profile().name} · ${profile().candle} candles · Saved in this browser.`);
    $('history-body').innerHTML = items.length ? items.map(item => `<tr><td>${escape(date(item.time))}</td><td><span class="history-signal ${allowedSignals.has(item.signal) ? item.signal : 'UNAVAILABLE'}">${escape(item.signal)}</span></td><td>${Number.isFinite(item.score) ? number(item.score, 0) : '—'}</td><td>${escape(money(item.price))}</td></tr>`).join('') : '<tr><td colspan="4" class="table-empty">No signals recorded for this mode and interval yet.</td></tr>';
  }

  function safeUrl(raw) {
    try {
      const url = new URL(raw);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }

  function renderResearch(research) {
    const summary = typeof research?.summary === 'string' ? research.summary : 'Run an AI review for current news and macro research with sources.';
    const citations = Array.isArray(research?.citations) ? research.citations.filter(c => Number.isInteger(c.startIndex) && Number.isInteger(c.endIndex) && c.startIndex >= 0 && c.endIndex > c.startIndex && c.endIndex <= summary.length && safeUrl(c.url)).sort((a, b) => a.startIndex - b.startIndex) : [];
    let cursor = 0;
    $('research-summary').replaceChildren();
    for (const citation of citations) {
      if (citation.startIndex < cursor) continue;
      $('research-summary').append(document.createTextNode(summary.slice(cursor, citation.startIndex)));
      const link = document.createElement('a');
      link.href = safeUrl(citation.url);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `[${citation.title || new URL(link.href).hostname}]`;
      $('research-summary').append(link);
      cursor = citation.endIndex;
    }
    $('research-summary').append(document.createTextNode(summary.slice(cursor).replace(/[^]*/g, ' [see sources below]')));
    setText('research-date', research?.asOf ? date(research.asOf) : 'AWAITING REVIEW');
    $('research-sources').replaceChildren();
    for (const [index, source] of (research?.sources || []).entries()) {
      const url = safeUrl(source.url);
      if (!url) continue;
      const link = document.createElement('a');
      link.href = url;
      link.textContent = `${index + 1}. ${source.title || new URL(url).hostname} ↗`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      $('research-sources').append(link);
    }
  }

  function renderMarketAgents(agents) {
    $('market-agents').innerHTML = Array.isArray(agents) && agents.length ? agents.map(agent => `<div class="market-agent"><h3>${escape(agent.name)}</h3><p>${escape(agent.summary)}</p><ul>${(agent.evidence || []).map(item => `<li>${escape(item)}</li>`).join('')}</ul></div>`).join('') : '<p class="empty-copy">Measured market evidence is unavailable.</p>';
  }

  function renderStatus(status) {
    if ((status.strategy || 'accumulation') !== state.strategy) return;
    state.status = status;
    state.analysisMethod = status.analysisMethod === 'openai' ? 'openai' : 'rules';
    if (state.payload?.analysis.analysisMethod && state.payload.analysis.analysisMethod !== state.analysisMethod) clearAnalysis(false);
    renderStrategyLabels();
    setText('ai-setup-status', isRules() ? 'Free rule-based agents · Ready' : `AI: ${status.aiConfigured ? 'Configured' : 'API key needed'}`);
    setText('telegram-setup-status', `Telegram: ${status.alertsConfigured ? 'Configured' : 'Setup needed'}`);
    setText('model-label', isRules() ? 'No paid API needed' : `Model: ${status.model || 'Not configured'}`);
    $('ai-setup-status').className = reviewReady() ? 'setup-ready' : 'setup-needed';
    $('telegram-setup-status').className = status.alertsConfigured ? 'setup-ready' : 'setup-needed';
    $('monitor-enabled').checked = !!status.monitorEnabled;
    $('monitor-enabled').disabled = state.setupBusy || !reviewReady() || !status.alertsConfigured;
    $('test-alert').disabled = state.setupBusy || !status.alertsConfigured;
    setText('monitor-status', status.running ? `A ${profile().name.toLowerCase()} ${isRules() ? 'analysis' : 'AI review'} is running. Results will appear when it finishes.` : status.monitorEnabled ? `${profile().monitoring} monitoring is on. Next review: ${date(status.nextRunAt)}. Last review: ${date(status.lastRunAt)}.` : `${profile().monitoring} monitoring is off.${status.lastRunAt ? ` Last review: ${date(status.lastRunAt)}.` : ''}`);
    const other = (status.monitoringStrategies || []).filter(id => id !== state.strategy && profiles[id]).map(id => profiles[id].name);
    setText('other-monitors', other.length ? `Also running separately: ${other.join(', ')}. This switch only changes ${profile().name.toLowerCase()} monitoring.` : 'Monitoring is separate for each strategy. Switching this view does not change any monitoring settings.');
    if (status.lastError || status.alertError) {
      $('setup-message').hidden = false;
      setText('setup-message', [status.lastError, status.alertError].filter(Boolean).join(' '));
    }
    setLoading(state.loading);
  }

  async function refreshStatus() {
    if (state.setupBusy) return;
    const strategy = state.strategy;
    const request = ++state.statusRequest;
    $('refresh-status').disabled = true;
    try {
      const response = await fetch(`/api/status?strategy=${encodeURIComponent(strategy)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Connection status could not be loaded.');
      const result = await response.json();
      if (strategy !== state.strategy || request !== state.statusRequest) return;
      renderStatus(result);
    } catch (error) {
      if (strategy !== state.strategy || request !== state.statusRequest) return;
      $('setup-message').hidden = false;
      setText('setup-message', error.message);
    } finally { if (request === state.statusRequest) $('refresh-status').disabled = false; }
  }

  async function setupAction(path, body, success) {
    if (state.setupBusy) return;
    const strategy = state.strategy;
    state.setupBusy = true;
    ++state.statusRequest;
    $('setup-message').hidden = true;
    $('monitor-enabled').disabled = true;
    $('test-alert').disabled = true;
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (strategy !== state.strategy) return;
      if (!response.ok) throw new Error(payload.error || 'This setup action could not be completed.');
      setText('setup-message', success);
      if (path === '/api/monitor') renderStatus(payload);
    } catch (error) { if (strategy === state.strategy) setText('setup-message', error.message); }
    finally { if (strategy === state.strategy) $('setup-message').hidden = false; state.setupBusy = false; await refreshStatus(); }
  }

  function expireDisplayedReport() {
    if (state.mode !== 'live' || !state.payload || !Number.isFinite(state.payload.expiresAt) || Date.now() < state.payload.expiresAt * 1000) return false;
    const expiredAt = state.payload.expiresAt;
    clearAnalysis(false);
    setText('signal-title', 'Review expired');
    setText('signal-summary', `The ${profile().name.toLowerCase()} analysis is no longer current. Run ${isRules() ? 'analysis again' : 'a new AI review'} for a fresh signal.`);
    setText('signal-footnote', 'Expired results cannot be used as a current buy signal.');
    setText('expiry-time', `Review expired: ${date(expiredAt)}`);
    connection('Review expired', 'error');
    setText('announcement', 'The previous review expired. No current buy signal is available.');
    return true;
  }

  function render(payload) {
    const analysis = payload.analysis;
    if (!analysis || !allowedSignals.has(analysis.signal)) throw new Error('The analysis response is incomplete. Please try again.');
    state.analysisMethod = analysis.analysisMethod === 'openai' ? 'openai' : analysis.analysisMethod === 'rules' ? 'rules' : state.analysisMethod;
    renderStrategyLabels();
    if (state.mode === 'live' && analysis.signal !== 'UNAVAILABLE' && !Number.isFinite(payload.expiresAt)) throw new Error('The review has no usable expiration time. A current signal cannot be shown.');
    state.payload = payload;
    if (expireDisplayedReport()) return;
    const metrics = analysis.metrics || {};
    document.querySelector('.signal-panel').dataset.signal = analysis.signal;
    setText('signal-title', signalNames[analysis.signal]);
    setText('signal-icon', signalIcons[analysis.signal]);
    setText('signal-summary', analysis.summary || 'No summary was returned. Inspect the checks below.');
    const score = Number.isFinite(analysis.score) ? Math.max(0, Math.min(100, analysis.score)) : null;
    $('agreement-value').innerHTML = `${score === null ? '—' : number(score, 0)}<span> / 100</span>`;
    $('agreement-fill').style.width = `${score || 0}%`;
    if (score === null) $('agreement-meter').removeAttribute('aria-valuenow');
    else $('agreement-meter').setAttribute('aria-valuenow', String(score));
    $('agreement-meter').setAttribute('aria-valuetext', score === null ? 'Not available' : `${Math.round(score)} out of 100 ${isRules() ? 'weighted rule alignment' : 'AI support'}, not probability of profit`);
    const failed = (analysis.gates || []).filter(g => !g.passed).length;
    setText('signal-footnote', state.mode === 'demo' ? 'Synthetic demonstration · not a real market signal' : analysis.signal === 'UNAVAILABLE' ? isRules() ? 'Usable market data is required; no current buy signal is available.' : analysis.aiStatus === 'pending' ? 'AI review is pending; no buy signal has been issued.' : 'A complete usable review is unavailable. See the details above.' : failed ? `${failed} check${failed > 1 ? 's' : ''} did not pass. Inspect the review below.` : 'Required checks passed · research signal only');
    setText('price', money(metrics.close, 2));
    setText('price-change', Number.isFinite(metrics.changePct) ? `${metrics.changePct >= 0 ? '+' : ''}${metrics.changePct.toFixed(2)}%` : '—');
    $('price-change').className = `price-change ${Number.isFinite(metrics.changePct) ? metrics.changePct >= 0 ? 'positive' : 'negative' : ''}`;
    $('price-change').title = 'Change from the previous completed candle';
    setText('rsi-value', number(metrics.rsi, 1));
    setText('rsi-detail', !Number.isFinite(metrics.rsi) ? 'Data unavailable' : metrics.rsi > 70 ? 'Above the common 70 threshold' : metrics.rsi < 30 ? 'Below the common 30 threshold' : 'Between the common 30–70 thresholds');
    const trendDifference = Number.isFinite(metrics.close) && Number.isFinite(metrics.sma200) && metrics.sma200 > 0 ? (metrics.close / metrics.sma200 - 1) * 100 : null;
    setText('trend-value', trendDifference === null ? '—' : `${trendDifference >= 0 ? '+' : ''}${trendDifference.toFixed(1)}%`);
    setText('trend-detail', trendDifference === null ? 'Data unavailable' : `${trendDifference >= 0 ? 'Above' : 'Below'} the 200-bar average of ${money(metrics.sma200)}`);
    setText('volume-value', Number.isFinite(metrics.volumeRatio) ? `${metrics.volumeRatio.toFixed(2)}×` : '—');
    setText('atr-value', Number.isFinite(metrics.atrPct) ? `${metrics.atrPct.toFixed(2)}%` : '—');
    setText('closed-time', `Completed candle: ${date(analysis.lastClosedAt)}`);
    setText('expiry-time', state.mode === 'demo' ? 'Synthetic demo · not a live signal' : `Review expires: ${date(payload.expiresAt)}`);
    setText('source-label', `Source: ${state.mode === 'demo' ? 'Synthetic demo' : payload.source || 'Kraken'}`);
    setText('version-label', `Strategy ${analysis.strategyVersion || 'prototype'} · Unvalidated`);
    renderChart(analysis.candles);
    renderAgents(analysis.agents);
    renderMarketAgents(analysis.marketAgents);
    renderResearch(analysis.research);
    renderGates(analysis.gates);
    renderHistory(payload.history);
    if (payload.status) renderStatus(payload.status);
    connection(state.mode === 'demo' ? 'Demo data' : !isRules() && analysis.aiStatus === 'pending' ? 'AI review pending' : analysis.signal === 'UNAVAILABLE' ? 'Analysis unavailable' : 'Market data connected', state.mode === 'demo' ? 'demo' : !isRules() && analysis.aiStatus === 'pending' ? 'pending' : analysis.signal === 'UNAVAILABLE' ? 'error' : 'healthy');
    setText('announcement', `${state.mode === 'demo' ? 'Demo analysis' : 'Analysis'} complete. ${signalNames[analysis.signal]}. ${analysis.summary || ''}`);
    clearTimeout(state.expiryTimer);
    if (state.mode === 'live' && Number.isFinite(payload.expiresAt)) state.expiryTimer = setTimeout(expireDisplayedReport, Math.max(0, payload.expiresAt * 1000 - Date.now()));
  }

  async function analyze(runReview = false) {
    if (state.loading && state.manualReview) return;
    state.manualReview = runReview && state.mode === 'live';
    const paidRequest = runReview && !isRules() && state.mode === 'live';
    const selected = { mode: state.mode, strategy: state.strategy, interval: state.interval };
    state.controller?.abort();
    const current = ++state.request;
    const controller = new AbortController();
    state.controller = controller;
    state.nextRefresh = null;
    $('error-banner').hidden = true;
    clearAnalysis(true);
    setLoading(true);
    connection(state.mode === 'demo' ? 'Preparing demo' : 'Checking market data', 'pending');
    setText('next-refresh', 'Next refresh: after analysis');
    const timeout = setTimeout(() => controller.abort(), paidRequest ? 600000 : 30000);
    try {
      const response = await fetch(runReview ? '/api/analyze' : `/api/analyze?mode=${encodeURIComponent(selected.mode)}&strategy=${encodeURIComponent(selected.strategy)}&interval=${selected.interval}`, { signal: controller.signal, cache: 'no-store', ...(runReview ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...selected, runReview: true }) } : {}) });
      const payload = await response.json().catch(() => { throw new Error('The server returned an unreadable response. Please try again.'); });
      if (current !== state.request || selected.strategy !== state.strategy || selected.mode !== state.mode) return;
      if (!response.ok) throw new Error(payload.error || `Market data request failed (${response.status}).`);
      if (payload.mode && payload.mode !== state.mode) throw new Error('The returned data mode did not match the requested mode. Please try again.');
      if ((payload.strategy || 'accumulation') !== selected.strategy || Number(payload.interval ?? 1440) !== selected.interval) throw new Error('The returned strategy did not match this view. Please try again.');
      render(payload);
    } catch (error) {
      if (current !== state.request) return;
      clearAnalysis(false);
      const message = error.name === 'AbortError' ? paidRequest ? 'The AI request timed out. The server may still be finishing its review; refresh status before trying again.' : 'The market data request timed out. Please try again.' : error.message || 'Market data could not be loaded.';
      $('error-banner').textContent = message;
      if (state.mode === 'live') {
        const demoButton = document.createElement('button');
        demoButton.type = 'button';
        demoButton.textContent = 'Explore the synthetic demo';
        demoButton.addEventListener('click', () => setMode('demo'));
        $('error-banner').append(demoButton);
      }
      $('error-banner').hidden = false;
      connection(state.mode === 'demo' ? 'Demo unavailable' : 'Connection unavailable', 'error');
      setText('announcement', `No current signal. ${message}`);
    } finally {
      clearTimeout(timeout);
      if (current === state.request) {
        state.lastChecked = Date.now();
        setText('refresh-time', `Last checked: ${date(state.lastChecked / 1000)}`);
        state.nextRefresh = $('auto-refresh').checked ? Date.now() + profile().refreshMs : null;
        setLoading(false);
        state.manualReview = false;
        updateCountdown();
      }
    }
  }

  function setMode(mode) {
    if (state.loading && state.manualReview) return;
    if (state.mode === mode && state.payload) return;
    state.mode = mode;
    $('demo-banner').hidden = mode !== 'demo';
    $('live-mode').classList.toggle('active', mode === 'live');
    $('demo-mode').classList.toggle('active', mode === 'demo');
    $('live-mode').setAttribute('aria-pressed', String(mode === 'live'));
    $('demo-mode').setAttribute('aria-pressed', String(mode === 'demo'));
    setText('signal-mode', mode === 'demo' ? 'SYNTHETIC DEMO' : 'LIVE ANALYSIS');
    analyze();
  }

  function renderStrategyLabels() {
    const intraday = state.strategy === 'daytrade';
    const rules = isRules();
    setText('strategy-description', rules ? intraday ? 'Free rule-based agents evaluate Bitcoin spot-buy setups within the day.' : 'Free rule-based agents evaluate Bitcoin for accumulation over months.' : intraday ? 'AI agents research Bitcoin spot-buy setups within the day. You see the evidence.' : 'AI agents research Bitcoin for accumulation over months. You see the evidence.');
    setText('setup-title', rules ? 'Free analysis & Telegram alerts' : 'AI research & Telegram alerts');
    setText('interval-label', intraday ? '15-minute candles' : 'Daily candles');
    setText('auto-refresh-label', intraday ? 'Refresh view every 1 min' : 'Refresh view every 5 min');
    setText('monitor-label', intraday ? 'Check every 15 min and send buy alerts' : 'Check daily and send buy alerts');
    setText('setup-help', rules ? `Analysis runs locally with public market data. No AI API key or paid model calls are needed. Connect Telegram only if you want phone alerts. ${profile().monitoring} monitoring checks ${profile().cadence}; keep this computer awake and the app running.` : `AI reviews use your OpenAI API balance (up to four model requests plus web search). Opening or refreshing this dashboard does not start a paid review. ${profile().monitoring} monitoring starts a review when enabled and checks ${profile().cadence}; keep this computer awake and the app running.`);
    $('daytrade-cost').hidden = rules || !intraday;
    $('research-panel').hidden = rules;
    $('market-evidence-panel').hidden = rules;
    $('agents-grid').dataset.method = rules ? 'rules' : 'openai';
    setText('agents-eyebrow', rules ? 'FREE RULE-BASED AGENTS' : 'THE AI RESEARCH TEAM');
    setText('agents-title', rules ? 'Four agents. Every rule visible.' : 'Independent views. A shared decision.');
    setText('agents-note', rules ? 'Three weighted votes + one risk check' : 'Two analysts + one risk reviewer');
    setText('agreement-label', rules ? 'Weighted rule alignment' : 'Weighted agreement');
    setText('agreement-help', rules ? 'Alignment of trading rules, not a probability of profit.' : 'Strength of AI support, not a probability of profit.');
    setText('demo-title', rules ? 'Demo mode — rules applied to synthetic market data' : 'Demo mode — synthetic data & simulated AI opinions');
    setText('demo-description', rules ? 'Demo results never trigger alerts. Any enabled live monitoring continues separately. These prices and signals do not describe the real Bitcoin market.' : 'Demo analysis uses no model calls and never triggers alerts. Any enabled live monitoring continues separately. These prices and opinions do not describe the real Bitcoin market.');
    setText('method-evidence', rules ? `Four rule-based agents evaluate trend, momentum, participation, and risk using completed ${profile().candle} candles. Trend, momentum, and participation contribute weighted scores. The risk agent can block a buy. Every result follows fixed, inspectable thresholds; no AI model or news research is used in this mode.` : intraday ? 'A news and event researcher gathers cited information. Two AI analysts independently review intraday trend, entry conditions, and measured evidence from completed 15-minute candles. A skeptical risk reviewer challenges both. Deterministic data and risk checks can block a spot-buy signal regardless of model opinion.' : 'A news and macro researcher gathers cited information. Two AI analysts independently review that research and measured market evidence for accumulation over months. A skeptical risk reviewer challenges both. Deterministic data and risk checks can block a buy signal regardless of model opinion.');
    setText('method-labels', rules ? 'Buy setup requires a weighted rule score of at least 60, bullish trend and momentum agents, and passing risk and data checks. Watch requires a score of at least 60 and passing risk checks. Wait means the rules do not qualify or a risk check blocks buying. Unavailable means the market data cannot support analysis.' : 'Buy setup requires both analysts to support the selected strategy with scores of at least 70, risk-review agreement, no veto, and all market checks passing. Watch means partial support. Wait means no qualifying setup or a blocking concern. Unavailable means a complete usable review is missing.');
    setText('method-limitations', rules ? 'The score measures rule alignment, not the chance of a profitable trade. Agents share price and volume data, so their results can be correlated. Both strategies are unvalidated spot-buy research, with no trade execution. Test with historical and paper trading results before relying on signals.' : 'The score measures AI support, not the chance of a profitable trade. Agents use the same model and shared evidence, so their views can be correlated. AI can misinterpret facts. Both strategies are unvalidated spot-buy research, with no trade execution. Review sources and test with historical and paper trading results before relying on signals.');
    setText('method-freshness', rules ? `Analysis uses completed ${profile().candle} candles, not the current live price. Free local rules are recalculated when the view refreshes, ${intraday ? 'every minute' : 'every five minutes'}. Results expire ${intraday ? 'after five minutes or at the next 15-minute candle close' : 'after six hours or at the next daily candle close'}, whichever happens first. This website computes signals while open. Telegram monitoring runs separately in the desktop app. Demo results never trigger alerts.` : intraday ? 'Analysis uses completed 15-minute candles, not the current live price. The view refreshes every minute without paid model calls. Day-trading reviews expire after five minutes or at the next candle close, whichever happens first. Optional monitoring starts paid reviews every 15 minutes, with no more than one buy alert per hour. Monitoring runs on this computer. Demo results never trigger alerts.' : 'Analysis uses completed daily candles, not the current live price. The view refreshes every five minutes without paid model calls. Accumulation reviews expire after six hours or at the next daily candle close, whichever happens first. Optional monitoring runs daily on this computer and sends eligible buy signals to Telegram. Demo results never trigger alerts.');
    setText('research-title', intraday ? 'News & intraday events' : 'News & macro research');
  }

  function setStrategy(strategy) {
    if (!profiles[strategy] || (state.loading && state.manualReview)) { $('strategy').value = state.strategy; return; }
    if (strategy === state.strategy) return;
    state.strategy = strategy;
    state.interval = profile().interval;
    state.status = null;
    state.lastChecked = null;
    state.nextRefresh = null;
    ++state.statusRequest;
    $('monitor-enabled').checked = false;
    $('monitor-enabled').disabled = true;
    $('test-alert').disabled = true;
    $('setup-message').hidden = true;
    setText('monitor-status', 'Checking monitoring status for this strategy…');
    setText('other-monitors', '');
    setText('refresh-time', 'Last checked: —');
    renderStrategyLabels();
    clearAnalysis(true);
    refreshStatus();
    analyze();
  }

  function updateCountdown() {
    expireDisplayedReport();
    if (state.loading) return;
    if (!state.nextRefresh) {
      setText('next-refresh', 'Auto refresh paused');
      return;
    }
    const remaining = Math.max(0, Math.ceil((state.nextRefresh - Date.now()) / 1000));
    setText('next-refresh', `Next check: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`);
    if (!remaining && !document.hidden) analyze();
  }

  $('live-mode').addEventListener('click', () => setMode('live'));
  $('demo-mode').addEventListener('click', () => setMode('demo'));
  $('strategy').addEventListener('change', () => setStrategy($('strategy').value));
  $('analyze').addEventListener('click', () => analyze(true));
  $('refresh-status').addEventListener('click', refreshStatus);
  $('test-alert').addEventListener('click', () => setupAction('/api/alerts/test', {}, 'Test alert sent to Telegram. Check your chat.'));
  $('monitor-enabled').addEventListener('change', () => setupAction('/api/monitor', { enabled: $('monitor-enabled').checked, strategy: state.strategy }, $('monitor-enabled').checked ? `${profile().monitoring} monitoring enabled. The first ${isRules() ? 'free analysis' : 'paid AI review'} starts shortly.` : `${profile().monitoring} monitoring disabled.`));
  $('auto-refresh').addEventListener('change', () => {
    state.nextRefresh = $('auto-refresh').checked ? Date.now() + profile().refreshMs : null;
    updateCountdown();
  });
  $('download').addEventListener('click', () => {
    if (!state.payload || state.loading) return;
    const blob = new Blob([JSON.stringify(state.payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `satoshi-signal-${state.strategy}-${state.mode}-${state.interval}m-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.addEventListener('visibilitychange', () => { updateCountdown(); if (!document.hidden) refreshStatus(); });
  setInterval(updateCountdown, 1000);
  setInterval(() => { if (!document.hidden) refreshStatus(); }, 30000);
  renderStrategyLabels();
  refreshStatus();
  analyze();
})();
