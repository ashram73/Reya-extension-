// --- CONFIG ---
const API = {
    REYA: "https://api.reya.xyz/v2/markets/summary",
    HYPERLIQUID: "https://api.hyperliquid.xyz/info",
    WALLET_BASE: "https://api.reya.xyz/v2/wallet",
    INCENTIVES: "https://api.reya.xyz/api/incentives/wallet",
    AI_ENDPOINT: "http://217.60.37.132:3000/chat"
};
const HISTORY_URL = "https://api.reya.xyz/v2/candleHistory";

// Navigation
const views = {
    menu: document.getElementById('menu-view'),
    list: document.getElementById('list-view'),
    overview: document.getElementById('overview-view'),
    arb: document.getElementById('arb-view'),
    wallet: document.getElementById('wallet-view'),
    trades: document.getElementById('trades-view'),
    points: document.getElementById('points-view'),
    chat: document.getElementById('chat-view'),
    chart: document.getElementById('chart-view')
};

// Bind Menu Buttons
const bind = (btnId, viewId, loadFunc) => {
    const btn = document.getElementById(btnId);
    if(btn) {
        btn.addEventListener('click', () => {
            Object.values(views).forEach(v => v.classList.add('hidden'));
            views[viewId].classList.remove('hidden');
            if(loadFunc) loadFunc();
        });
    }
};

bind('btn-live-markets', 'list', fetchMarkets);
bind('btn-overview', 'overview', fetchMarkets); // Fetch same data for overview
bind('btn-arbitrage', 'arb', fetchArb);
bind('btn-wallet', 'wallet', () => loadSaved('walletInput'));
bind('btn-trades', 'trades', () => loadSaved('tradeInput'));
bind('btn-points', 'points', () => loadSaved('pointsInput'));
bind('btn-chat', 'chat', () => setTimeout(() => document.getElementById('chatInput').focus(), 100));

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        Object.values(views).forEach(v => v.classList.add('hidden'));
        const target = btn.getAttribute('data-target');
        if(views[target]) views[target].classList.remove('hidden');
    });
});

// Action Buttons
document.getElementById('btn-check-wallet').onclick = () => fetchPos(document.getElementById('walletInput').value.trim());
document.getElementById('btn-check-trades').onclick = () => fetchTrades(document.getElementById('tradeInput').value.trim());
document.getElementById('btn-check-points').onclick = () => fetchPoints(document.getElementById('pointsInput').value.trim());

// Chat Logic
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('btn-send-chat');
sendBtn.onclick = sendChat;
chatInput.onkeypress = (e) => { if(e.key==='Enter') sendChat(); };

// --- HELPER UTILS ---
const formatCurrency = (val) => {
    const v = parseFloat(val);
    if (isNaN(v)) return "$0.00";
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
    return `$${v.toFixed(2)}`;
};

const cleanSymbol = (s) => {
    if (!s) return "UNKNOWN";
    return s.replace("RUSDPERP", "").replace("USDT", "").replace("-PERP", "");
};

// --- DATA FETCHING ---

async function fetchMarkets() {
    try {
        const res = await fetch(API.REYA);
        if (!res.ok) throw new Error("API Error");
        const data = await res.json();
        
        // Render List
        renderList(data);
        
        // Render Overview (Check if view is active to save resources, or just render)
        if (!views.overview.classList.contains('hidden')) {
            renderOverview(data);
        }
    } catch(e) { 
        console.error(e); 
    }
}

function renderList(data) {
    const box = document.getElementById('market-list');
    box.innerHTML = "";
    const term = document.getElementById('searchInput').value.toLowerCase();
    
    data.filter(i => i.symbol && i.symbol.toLowerCase().includes(term))
        .sort((a,b) => parseFloat(b.volume24h) - parseFloat(a.volume24h))
        .forEach(i => {
            const sym = cleanSymbol(i.symbol);
            const px = parseFloat(i.throttledOraclePrice).toFixed(3);
            const chg = parseFloat(i.pxChange24h).toFixed(2);
            const el = document.createElement('div');
            el.className = 'market-item';
            el.innerHTML = `<b>${sym}</b><div style="text-align:right"><div>$${px}</div><div class="${chg>=0?'green':'red'}">${chg}%</div></div>`;
            el.onclick = () => loadChart(i.symbol);
            box.appendChild(el);
        });
}
document.getElementById('searchInput').oninput = fetchMarkets;

// --- FIXED OVERVIEW RENDER FUNCTION ---
function renderOverview(data) {
    if (!data || !Array.isArray(data)) return;

    let totalVol = 0;
    let totalOI = 0;
    
    const items = data.map(m => {
        // Safe number conversion
        const vol = parseFloat(m.volume24h) || 0;
        const price = parseFloat(m.throttledOraclePrice) || 0;
        const oiQty = parseFloat(m.oiQty) || 0;
        const oiVal = oiQty * price;
        const change = parseFloat(m.pxChange24h) || 0;
        const sym = cleanSymbol(m.symbol);

        totalVol += vol;
        totalOI += oiVal;

        return { symbol: sym, vol: vol, oi: oiVal, change: change };
    });

    // Update Global Stats
    const elVol = document.getElementById('ov-vol');
    const elOI = document.getElementById('ov-oi');
    if(elVol) elVol.innerText = formatCurrency(totalVol);
    if(elOI) elOI.innerText = formatCurrency(totalOI);

    // Highlights (Top Vol & Top OI)
    const topVol = [...items].sort((a,b) => b.vol - a.vol)[0];
    const topOI = [...items].sort((a,b) => b.oi - a.oi)[0];

    const elTopVol = document.getElementById('ov-top-vol');
    const elTopOI = document.getElementById('ov-top-oi');

    if (topVol && elTopVol) {
        elTopVol.innerHTML = `${topVol.symbol} <small>${formatCurrency(topVol.vol)}</small>`;
    }
    if (topOI && elTopOI) {
        elTopOI.innerHTML = `${topOI.symbol} <small>${formatCurrency(topOI.oi)}</small>`;
    }

    // Gainers & Losers Lists
    const sortedByChange = [...items].sort((a,b) => b.change - a.change);
    const gainers = sortedByChange.slice(0, 5);
    const losers = [...items].sort((a,b) => a.change - b.change).slice(0, 5);

    const renderMiniList = (arr, elementId) => {
        const el = document.getElementById(elementId);
        if (!el) return;
        el.innerHTML = arr.map(i => `
            <div class="row">
                <span>${i.symbol}</span>
                <span class="${i.change >= 0 ? 'green' : 'red'}">
                    ${i.change > 0 ? '+' : ''}${i.change.toFixed(2)}%
                </span>
            </div>
        `).join('');
    };

    renderMiniList(gainers, 'list-gainers');
    renderMiniList(losers, 'list-losers');
}

// --- ARBITRAGE ---
async function fetchArb() {
    const box = document.getElementById('arb-list');
    box.innerHTML = '<div class="loader">Scanning...</div>';
    try {
        const [rRes, hRes] = await Promise.all([
            fetch(API.REYA),
            fetch(API.HYPERLIQUID, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:"metaAndAssetCtxs"})})
        ]);
        const rData = await rRes.json();
        const hData = await hRes.json();
        const hMap = {};
        if(hData[0]) hData[0].universe.forEach((u,i) => { if(hData[1][i]) hMap[u.name] = parseFloat(hData[1][i].funding)*24*365*100; });
        
        box.innerHTML = "";
        rData.forEach(r => {
            const sym = cleanSymbol(r.symbol);
            const rApr = parseFloat(r.fundingRate)*24*365*100;
            const hApr = hMap[sym];
            if(hApr !== undefined) {
                const diff = hApr - rApr;
                const el = document.createElement('div');
                el.className = 'arb-item';
                el.innerHTML = `<div>${sym}</div><div class="${rApr>0?'red':'green'}">${rApr.toFixed(1)}%</div><div class="${hApr>0?'red':'green'}">${hApr.toFixed(1)}%</div><div style="font-weight:bold">${Math.abs(diff).toFixed(1)}%</div>`;
                box.appendChild(el);
            }
        });
    } catch(e) { box.innerHTML = "<div style='text-align:center;padding:20px;color:#555'>Data Error</div>"; }
}

// --- POSITIONS ---
async function fetchPos(addr) {
    const box = document.getElementById('positions-list');
    box.innerHTML = '<div class="loader">Loading...</div>';
    document.getElementById('pnl-box').classList.add('hidden');
    chrome.storage.local.set({savedWallet: addr});
    
    if (!addr) { box.innerHTML = "Enter address"; return; }

    try {
        const [pRes, mRes] = await Promise.all([fetch(`${API.WALLET_BASE}/${addr}/positions`), fetch(API.REYA)]);
        
        if(!pRes.ok) throw new Error("Wallet Error");
        const pos = await pRes.json();
        const market = await mRes.json();
        
        const prices = {};
        market.forEach(m => prices[m.symbol] = parseFloat(m.throttledOraclePrice));
        
        box.innerHTML = "";
        let total = 0;
        if(pos && pos.length) {
            document.getElementById('pnl-box').classList.remove('hidden');
            pos.forEach(p => {
                const sym = cleanSymbol(p.symbol);
                const qty = parseFloat(p.qty);
                const ent = parseFloat(p.avgEntryPrice);
                const cur = prices[p.symbol] || ent;
                const pnl = p.side === 'B' ? (cur-ent)*qty : (ent-cur)*qty;
                total += pnl;
                
                const el = document.createElement('div');
                el.className = 'pos-item';
                el.innerHTML = `
                    <div>${sym} <small style="color:#666">${qty.toFixed(3)}</small></div>
                    <div class="${p.side==='B'?'green':'red'}">${p.side==='B'?'LONG':'SHORT'}</div>
                    <div style="text-align:right"><div>${ent.toFixed(2)}</div><div style="color:#666">${cur.toFixed(2)}</div></div>
                    <div class="${pnl>=0?'green':'red'}">${pnl.toFixed(2)}</div>`;
                box.appendChild(el);
            });
            const pnlEl = document.getElementById('total-pnl');
            pnlEl.innerText = `$${total.toFixed(2)}`;
            pnlEl.className = `val ${total>=0?'green':'red'}`;
        } else { box.innerHTML = '<div style="text-align:center;padding:20px;color:#555">No open positions</div>'; }
    } catch(e) { box.innerHTML = "<div style='text-align:center;padding:20px;color:red'>Error loading positions</div>"; }
}

// --- TRADES ---
async function fetchTrades(addr) {
    const box = document.getElementById('trades-list');
    box.innerHTML = '<div class="loader">Loading...</div>';
    chrome.storage.local.set({savedWallet: addr});
    try {
        const res = await fetch(`${API.WALLET_BASE}/${addr}/perpExecutions?limit=50`);
        if(res.status===504) throw new Error("Timeout");
        const data = await res.json();
        box.innerHTML = "";
        if(data.data && data.data.length) {
            data.data.forEach(t => {
                const el = document.createElement('div');
                el.className = 'trade-item';
                el.innerHTML = `<div style="color:#666;font-size:10px">${new Date(t.blockTimestamp*1000).toLocaleTimeString()}</div><div>${cleanSymbol(t.symbol)} <span class="${t.side==='B'?'green':'red'}" style="font-size:10px">${t.side==='B'?'BUY':'SELL'}</span></div><div style="text-align:right"><div>${parseFloat(t.price).toFixed(2)}</div><div style="color:#666">${parseFloat(t.qty).toFixed(3)}</div></div>`;
                box.appendChild(el);
            });
        } else { box.innerHTML = '<div style="text-align:center;padding:20px;color:#555">No trades found</div>'; }
    } catch(e) { box.innerHTML = "<div style='text-align:center;padding:20px;color:red'>Error loading history</div>"; }
}

// --- POINTS ---
async function fetchPoints(addr) {
    const box = document.getElementById('points-list');
    box.innerHTML = '<div class="loader">Fetching...</div>';
    chrome.storage.local.set({savedWallet: addr});
    try {
        const res = await fetch(`${API.INCENTIVES}/${addr}`);
        const data = await res.json();
        if(!data.points) { box.innerHTML = "<div style='text-align:center;padding:20px;color:#555'>No data</div>"; return; }
        
        box.innerHTML = "";
        for (const [period, obj] of Object.entries(data.points)) {
            const rows = Object.entries(obj).map(([k,v]) => `<div class="point-row"><span>${k}</span><b>${parseFloat(v).toLocaleString()}</b></div>`).join('');
            const card = document.createElement('div');
            card.className = 'point-card';
            card.innerHTML = `<div class="point-head">${period.replace(/_/g,' ').toUpperCase()}</div><div>${rows}</div>`;
            box.appendChild(card);
        }
    } catch(e) { box.innerHTML = `<div style="text-align:center;padding:20px;color:red">Error fetching points</div>`; }
}

// --- CHAT ---
async function sendChat() {
    const txt = chatInput.value.trim();
    if(!txt) return;
    addMsg(txt, 'user-msg');
    chatInput.value = '';
    sendBtn.disabled = true;
    const loadId = addMsg("Thinking...", 'bot');
    
    try {
        const res = await fetch(API.AI_ENDPOINT, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ question: txt })
        });
        if(!res.ok) throw new Error("Server Error");
        const data = await res.json();
        document.getElementById(loadId).innerText = data.answer || "No response";
    } catch(e) {
        document.getElementById(loadId).innerText = "Connection Error (Check Server/SSL)";
        document.getElementById(loadId).classList.add('error-msg');
    } finally {
        sendBtn.disabled = false;
        chatInput.focus();
    }
}

function addMsg(txt, cls) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.id = 'msg-'+Date.now();
    div.className = `msg ${cls}`;
    div.innerText = txt;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    return div.id;
}

// --- STORAGE & CHART ---
function loadSaved(id) {
    chrome.storage.local.get(['savedWallet'], r => { if(r.savedWallet) document.getElementById(id).value = r.savedWallet; });
}

async function loadChart(symbol) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views['chart'].classList.remove('hidden');
    const ctx = document.getElementById("priceCanvas").getContext("2d");
    document.getElementById("chartTitle").innerText = cleanSymbol(symbol);
    ctx.clearRect(0,0,300,150);
    try {
        const res = await fetch(`${HISTORY_URL}/${symbol}/1h?endTime=${Date.now()}`);
        const data = await res.json();
        if(!data.c) return;
        const c = data.c.slice(-40).map(Number);
        const min = Math.min(...c), max = Math.max(...c);
        document.getElementById("chartHigh").innerText = `$${max.toFixed(2)}`;
        document.getElementById("chartLow").innerText = `$${min.toFixed(2)}`;
        
        ctx.beginPath(); ctx.strokeStyle = c[c.length-1]>=c[0]?'#22c55e':'#ef4444'; ctx.lineWidth=2;
        c.forEach((p,i) => {
            const x = (i/(c.length-1))*300, y = 150 - ((p-min)/(max-min))*130 - 10;
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.stroke();
    } catch(e) {}
}