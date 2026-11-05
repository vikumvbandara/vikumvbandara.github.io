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
  connect();
})();
