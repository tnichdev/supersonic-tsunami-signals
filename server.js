const http = require('http');
const signals = {};

function getSignalMeta(zone) {
  const map = {
    'ABOVE_MEAN': { signal:'HOLD',       color:'#5b9cf6', margin:false, description:'Above weekly mean — no action' },
    'AT_MEAN':    { signal:'MONITOR',    color:'#f5a623', margin:false, description:'At weekly mean — monitor' },
    '1_SIGMA':    { signal:'ACCUMULATE', color:'#3ecf6e', margin:false, description:'1σ — cash accumulate (1-2% equity)' },
    '2_SIGMA':    { signal:'ACCUMULATE', color:'#3ecf6e', margin:true,  description:'2σ — margin authorized (2-3% equity)' },
    '3_SIGMA':    { signal:'ACCUMULATE', color:'#f16060', margin:true,  description:'3σ — maximum margin (4-5% equity)' },
  };
  return map[zone] || { signal:'HOLD', color:'#5b9cf6', margin:false, description:'No signal' };
}

function getSizing(zone, price) {
  const equity = 22124;
  const sizing = { '1_SIGMA':{min:0.01,max:0.02}, '2_SIGMA':{min:0.02,max:0.03}, '3_SIGMA':{min:0.04,max:0.05} };
  const s = sizing[zone];
  if (!s || !price) return null;
  const minD = Math.round(equity * s.min);
  const maxD = Math.round(equity * s.max);
  return { minDollar:minD, maxDollar:maxD, minShares:Math.floor(minD/price), maxShares:Math.floor(maxD/price) };
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const ticker = (data.ticker||'').replace(/^(NYSE:|NASDAQ:|CRYPTO:)/,'').toUpperCase();
        const zone = (data.zone||'').toUpperCase();
        const price = parseFloat(data.price) || null;
        if (!ticker || !zone) { res.writeHead(400); res.end(JSON.stringify({error:'Missing ticker or zone'})); return; }
        const meta = getSignalMeta(zone);
        signals[ticker] = { ticker, zone, signal:meta.signal, color:meta.color, margin:meta.margin, description:meta.description, price, sizing:getSizing(zone,price), timestamp:new Date().toISOString() };
        console.log(`[SIGNAL] ${ticker} → ${zone} @ $${price}`);
        res.writeHead(200); res.end(JSON.stringify({ok:true, ticker, zone, signal:meta.signal}));
      } catch(e) { res.writeHead(400); res.end(JSON.stringify({error:'Invalid JSON'})); }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/signals') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true, signals, count:Object.keys(signals).length, retrievedAt:new Date().toISOString()}));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify({ok:true, status:'running', signalCount:Object.keys(signals).length, uptime:Math.round(process.uptime())+'s'}));
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    const rows = Object.values(signals).sort((a,b)=>a.ticker.localeCompare(b.ticker))
      .map(s=>`<tr><td style="color:${s.color};font-weight:600">${s.ticker}</td><td>${s.zone}</td><td style="color:${s.color};font-weight:600">${s.signal}</td><td>${s.margin?'✓ Margin OK':'Cash only'}</td><td>$${s.price||'—'}</td><td>${new Date(s.timestamp).toLocaleString()}</td></tr>`).join('');
    res.writeHead(200, {'Content-Type':'text/html'});
    res.end(`<!DOCTYPE html><html><head><title>Supersonic Tsunami Signals</title><style>body{font-family:monospace;background:#0a0a0a;color:#e8e4dc;padding:2rem}h1{color:#c9a84c;margin-bottom:.5rem}p{color:#888;margin-bottom:2rem}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;border-bottom:1px solid #333;color:#555;font-size:11px;text-transform:uppercase;letter-spacing:.1em}td{padding:8px 12px;border-bottom:1px solid #1a1a1a;font-size:13px}.live{display:inline-block;padding:3px 10px;border-radius:4px;background:#1a2a1a;color:#3ecf6e;font-size:11px;margin-left:1rem}</style></head><body><h1>Supersonic Tsunami Signal Server <span class="live">● LIVE</span></h1><p>${Object.keys(signals).length} active signals</p><table><thead><tr><th>Ticker</th><th>Zone</th><th>Signal</th><th>Margin</th><th>Price</th><th>Last Update</th></tr></thead><tbody>${rows||'<tr><td colspan="6" style="color:#555;text-align:center;padding:2rem">No signals yet — set up TradingView alerts to begin</td></tr>'}</tbody></table></body></html>`);
    return;
  }

  res.writeHead(404); res.end(JSON.stringify({error:'Not found'}));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Supersonic Tsunami Signal Server running on port ${PORT}`));
