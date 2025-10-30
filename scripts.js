// StarBlue portfolio script
// Uses Chart.js (included in index.html). All data stored in localStorage under "starblue_portfolio"

(() => {
  // ---------- Utilities ----------
  const $ = (sel) => document.querySelector(sel);
  const fmt = (v) => '$' + Number(v || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
  const nowLabel = () => {
    const d = new Date();
    return d.toLocaleString();
  };

  // ---------- Default state ----------
  const DEFAULT = {
    cash: 100.00,
    holdings: {}, // symbol -> {shares: number, lastPrice: number}
    transactions: [], // {time, symbol, price, shares, type}
    history: [ { time: new Date().toISOString(), total: 100.00 } ]
  };

  // ---------- Persistence helpers ----------
  const STORAGE_KEY = 'starblue_portfolio';
  function loadState(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return JSON.parse(JSON.stringify(DEFAULT));
      const parsed = JSON.parse(raw);
      // migrate/validate basic fields:
      parsed.cash = Number(parsed.cash) || 0;
      parsed.holdings = parsed.holdings || {};
      parsed.transactions = parsed.transactions || [];
      parsed.history = parsed.history || [{time:new Date().toISOString(), total: parsed.cash}];
      return parsed;
    } catch(e){
      console.error('load error', e);
      return JSON.parse(JSON.stringify(DEFAULT));
    }
  }
  function saveState(s){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }
  function resetState(){
    localStorage.removeItem(STORAGE_KEY);
    state = JSON.parse(JSON.stringify(DEFAULT));
    saveState(state);
    refreshAll();
  }

  // ---------- State ----------
  let state = loadState();

  // ---------- DOM refs ----------
  const cashDisplay = $('#cash-display');
  const holdingsContainer = $('#holdingsContainer');
  const transactionsContainer = $('#transactionsContainer');
  const transactionForm = $('#transactionForm');
  const priceForm = $('#priceForm');
  const addTransactionBtn = $('#addTransactionBtn');
  const updatePricesBtn = $('#updatePricesBtn');
  const resetBtn = $('#resetBtn');
  const yearSpan = $('#year');
  yearSpan.textContent = new Date().getFullYear();

  // Chart setup
  const ctx = document.getElementById('portfolioChart').getContext('2d');
  let chart = null;
  function buildChart(){
    const labels = state.history.map(h => new Date(h.time).toLocaleString());
    const data = state.history.map(h => h.total);

    if(chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Portfolio Value',
          data,
          fill: true,
          tension: 0.22,
          pointRadius: 3,
          borderWidth: 2,
          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--accent-1') || '#2b6bff',
          backgroundColor: 'rgba(43,107,255,0.12)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              callback: function(value){ return '$' + value.toLocaleString(); }
            },
            beginAtZero: true
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx){
                return `${ctx.dataset.label}: $${Number(ctx.parsed.y).toLocaleString(undefined,{minimumFractionDigits:2})}`;
              }
            }
          }
        }
      }
    });
  }

  // ---------- Core logic ----------
  function computePortfolioTotal(){
    let total = Number(state.cash) || 0;
    for(const sym of Object.keys(state.holdings)){
      const h = state.holdings[sym];
      const price = Number(h.lastPrice) || 0;
      total += Number(h.shares) * price;
    }
    return Number(total);
  }

  function pushHistoryPoint(noteTime = new Date()){
    const total = computePortfolioTotal();
    state.history.push({ time: noteTime.toISOString(), total: Number(total) });
    // keep history size reasonable
    if(state.history.length > 1200) state.history.shift();
    saveState(state);
    buildChart();
    refreshUI();
  }

  // update a symbol's lastPrice (only if holding exists or user forces update)
  function updateSymbolPrice(symbol, price){
    symbol = symbol.trim().toUpperCase();
    if(!symbol) return;
    if(!state.holdings[symbol]) {
      // create a zero-holdings entry so valuation can track
      state.holdings[symbol] = { shares: 0, lastPrice: Number(price) };
    } else {
      state.holdings[symbol].lastPrice = Number(price);
    }
    state.transactions.push({
      time: new Date().toISOString(),
      symbol,
      price: Number(price),
      shares: 0,
      type: 'price-update'
    });
    saveState(state);
    pushHistoryPoint();
  }

  // add transaction: shares positive = buy, negative = sell
  function addTransaction(symbol, price, shares){
    symbol = symbol.trim().toUpperCase();
    price = Number(price);
    shares = Number(shares);
    if(!symbol || !isFinite(price) || !isFinite(shares)) {
      alert('Invalid transaction inputs.');
      return;
    }

    const cost = price * shares;

    // For buys (shares>0), reduce cash; for sells (shares<0), increase cash
    state.cash = Number(state.cash) - cost;

    // Update holdings
    if(!state.holdings[symbol]) state.holdings[symbol] = { shares: 0, lastPrice: price };
    state.holdings[symbol].shares = Number(state.holdings[symbol].shares) + shares;
    // update lastPrice to new price
    state.holdings[symbol].lastPrice = price;

    // If holdings go to (close to) zero, remove entry to tidy up
    if(Math.abs(state.holdings[symbol].shares) < 1e-8) delete state.holdings[symbol];

    // record transaction
    state.transactions.unshift({
      time: new Date().toISOString(),
      symbol,
      price,
      shares,
      type: shares > 0 ? 'buy' : 'sell'
    });

    saveState(state);
    pushHistoryPoint();
  }

  // ---------- UI rendering ----------
  function refreshUI(){
    cashDisplay.textContent = fmt(state.cash);

    // holdings
    holdingsContainer.innerHTML = '';
    const keys = Object.keys(state.holdings);
    if(keys.length === 0){
      holdingsContainer.innerHTML = `<div class="small-muted">No holdings — cash only.</div>`;
    } else {
      keys.sort();
      for(const sym of keys){
        const h = state.holdings[sym];
        const value = (Number(h.shares) * Number(h.lastPrice)) || 0;
        const node = document.createElement('div');
        node.className = 'h-item';
        node.innerHTML = `
          <div class="h-meta">
            <div class="symbol-badge">${sym.slice(0,3)}</div>
            <div class="h-info">
              <div style="font-weight:700">${sym} · ${Number(h.shares).toLocaleString(undefined,{maximumFractionDigits:6})} sh</div>
              <div class="small-muted">Price: ${fmt(h.lastPrice)} · Value: ${fmt(value)}</div>
            </div>
          </div>
          <div class="h-actions">
            <button class="btn subtle" data-sym="${sym}" data-action="sell">Sell</button>
            <button class="btn subtle" data-sym="${sym}" data-action="buy">Buy</button>
          </div>
        `;
        holdingsContainer.appendChild(node);
      }
    }

    // transactions
    transactionsContainer.innerHTML = '';
    if(state.transactions.length === 0){
      transactionsContainer.innerHTML = `<div class="small-muted">No transactions yet.</div>`;
    } else {
      for(const t of state.transactions.slice(0,30)){
        const node = document.createElement('div');
        node.className = 't-item';
        const time = new Date(t.time).toLocaleString();
        const txtShares = t.shares === 0 ? 'price' : (t.shares > 0 ? `+${t.shares}` : t.shares);
        node.innerHTML = `
          <div style="display:flex;flex-direction:column">
            <div style="font-weight:700">${t.symbol} · ${t.type.toUpperCase()}</div>
            <div class="small-muted">${time} · ${txtShares} @ ${fmt(t.price)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:700">${fmt((t.shares||0) * t.price)}</div>
          </div>
        `;
        transactionsContainer.appendChild(node);
      }
    }
  }

  function refreshAll(){
    buildChart();
    refreshUI();
  }

  // ---------- Listeners ----------
  transactionForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const symbol = $('#symbol').value.trim();
    const price = Number($('#price').value);
    const shares = Number($('#shares').value);
    if(!symbol || !isFinite(price) || !isFinite(shares)) {
      alert('Enter valid symbol, price and shares.');
      return;
    }
    addTransaction(symbol, price, shares);
    transactionForm.reset();
  });

  priceForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const symbol = $('#priceSymbol').value.trim();
    const newPrice = Number($('#priceUpdate').value);
    if(!symbol || !isFinite(newPrice)) {
      alert('Enter valid symbol and price.');
      return;
    }
    updateSymbolPrice(symbol, newPrice);
    priceForm.reset();
  });

  addTransactionBtn.addEventListener('click', () => {
    // focus transaction form for quick entry
    document.getElementById('symbol').focus();
    window.scrollTo({top: document.getElementById('forms').offsetTop - 20, behavior: 'smooth'});
  });

  updatePricesBtn.addEventListener('click', () => {
    // Quick-sim: prompt to update prices for all holdings by random small delta (simulate market movement)
    if(Object.keys(state.holdings).length === 0){
      alert('No holdings to update. Add a position first.');
      return;
    }
    if(!confirm('Simulate a market tick: randomly move each holding price ±0–5%?')) return;
    for(const sym of Object.keys(state.holdings)){
      const h = state.holdings[sym];
      const pct = (Math.random() * 0.05) * (Math.random()>0.5 ? 1 : -1);
      const newPrice = Math.max(0.0001, Number(h.lastPrice) * (1 + pct));
      h.lastPrice = Number(newPrice);
      state.transactions.unshift({
        time: new Date().toISOString(),
        symbol: sym,
        price: Number(newPrice),
        shares: 0,
        type: 'price-update'
      });
    }
    saveState(state);
    pushHistoryPoint();
  });

  resetBtn.addEventListener('click', () => {
    if(confirm('Reset StarBlue project to initial state? This clears local data.')) resetState();
  });

  // Quick holdings buy/sell buttons (delegated)
  holdingsContainer.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-action]');
    if(!btn) return;
    const sym = btn.dataset.sym;
    const action = btn.dataset.action;
    // open transaction form prepopulated
    const pricePref = state.holdings[sym] ? state.holdings[sym].lastPrice : 0;
    $('#symbol').value = sym;
    $('#price').value = Number(pricePref).toFixed(2);
    $('#shares').value = action === 'buy' ? '1' : '-1';
    document.getElementById('symbol').focus();
    window.scrollTo({top: document.getElementById('forms').offsetTop - 20, behavior: 'smooth'});
  });

  // Contact form demo (client-side only)
  $('#contactForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    alert('Thanks — message simulated. Replace the form action to post to your backend.');
    $('#contactForm').reset();
  });

  // Initialize chart/history if empty
  if(!state.history || state.history.length === 0) {
    state.history = [{time: new Date().toISOString(), total: state.cash}];
    saveState(state);
  }

  // Build initial chart and UI
  refreshAll();

  // expose for quick console inspection (dev convenience)
  window.StarBlue = {
    state,
    saveState,
    loadState,
    pushHistoryPoint,
    computePortfolioTotal,
    resetState
  };
})();
