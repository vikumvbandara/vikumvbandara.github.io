(() => {
  const price = document.getElementById('btc-price');
  const status = document.getElementById('btc-price-status');
  let lastTrade = 0;
  let socket;
  function connect() {
    status.textContent = 'Connecting to Coinbase…';
    socket = new WebSocket('wss://ws-feed.exchange.coinbase.com');
    socket.addEventListener('open', () => socket.send(JSON.stringify({type:'subscribe',product_ids:['BTC-USD'],channels:['matches']})));
    socket.addEventListener('message', event => {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      if (data.type !== 'match' || data.product_id !== 'BTC-USD') return;
      const n = Number(data.price), t = Date.parse(data.time);
      if (!Number.isFinite(n) || !Number.isFinite(t)) return;
      price.textContent = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
      lastTrade = t;
      status.textContent = 'Last trade: ' + new Date(t).toLocaleString() + ' · Coinbase';
    });
    socket.addEventListener('error', () => { status.textContent = 'Price feed unavailable; reconnecting.'; });
    socket.addEventListener('close', () => { status.textContent = 'Disconnected; reconnecting. Last price may be stale.'; setTimeout(connect, 5000); });
  }
  setInterval(() => { if (lastTrade && Date.now() - lastTrade > 30000) status.textContent = 'No recent trade received. Last price may be stale.'; }, 10000);
  const reportStatus = document.getElementById('report-status');
  const reportList = document.getElementById('report-list');
  async function loadReports() {
    try {
      const key = 'sb_publishable_T9HtwlgZMLNgYWn1kxEEcQ_S4DbGjWz';
      const response = await fetch('https://tmsamlowojaxdtkvtejx.supabase.co/rest/v1/paper_trading_reports?select=report_date,report,updated_at&order=report_date.desc', {headers:{apikey:key},cache:'no-store'});
      if (!response.ok) throw new Error('Unable to read reports');
      const rows = await response.json();
      reportList.replaceChildren();
      if (!rows.length) { reportStatus.textContent = 'No reports published yet. The laptop publisher is not connected.'; return; }
      reportStatus.textContent = 'Paper reports · latest first';
      for (const row of rows) {
        const section = document.createElement('section');
        const title = document.createElement('h3');
        title.textContent = row.report_date;
        const summary = document.createElement('p');
        const r = row.report || {};
        const pnl = r.net_pnl_usd == null ? 'Unavailable' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(r.net_pnl_usd));
        summary.textContent = (r.status || 'Unknown').replaceAll('_',' ') + ' · Net P/L: ' + pnl + ' · ' + (r.final ? 'Final' : 'Provisional');
        const details = document.createElement('details');
        const label = document.createElement('summary'); label.textContent = 'Full paper report';
        const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.textContent = JSON.stringify(r, null, 2);
        details.append(label,pre); section.append(title,summary,details); reportList.append(section);
      }
    } catch {
      reportStatus.textContent = 'Reports are unavailable right now. Please refresh later.';
    }
  }
  loadReports(); setInterval(loadReports, 60000);
  connect();
})();
