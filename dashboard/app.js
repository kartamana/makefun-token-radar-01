// Token Radar's night dashboard (radar-2). It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan, plus a what-if sandbox that re-scores the board
// from the same function. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  // The watchlist is the floor: main.ts carries its slugs in the data, so the page can filter to
  // exactly those 40 rows and tag them. TVL alone cannot recover them: 63 rankable protocols sit
  // above the floor without being on the watchlist.
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchlistOnly: false, momentumOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, sandbox: false, catScale: 1, growthWeight: DATA.model.growth_weight, momentumWeight: DATA.model.momentum_weight, maturityFloor: DATA.model.maturity_floor };

  // One category's concentration, by name, for the crowding discount below.
  var CONC = {};
  (DATA.concentrations || []).forEach(function (c) { CONC[c.category] = c; });
  function crowdOf(row, model) {
    var c = CONC[row.category || 'Other'];
    var hhi = c ? c.hhi : DATA.global_hhi;
    return Math.min(1, Math.max(model.crowd_floor, 1 - model.crowd_weight * hhi));
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // implied = round(tvl x categoryMultiple x growth x momentum x maturity x breadth x crowd); the
  // sandbox scales the category multiple and re-weights growth, momentum and maturity, and re-sorts
  // the board from the same math. Crowding has no sandbox control: it is the category's own discount.
  function impliedOf(row, model, catScale) {
    var change = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, change));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var momentum = 1 + model.momentum_weight * Math.tanh(change / model.momentum_scale);
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains);
    var breadth = 1 + model.breadth_step * extra;
    var crowd = crowdOf(row, model);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * (catScale || 1) * growthMult * momentum * maturity * breadth * crowd));
  }
  function sandboxImplied(row) {
    var m = { growth_cap: DATA.model.growth_cap, growth_floor: DATA.model.growth_floor, growth_weight: state.growthWeight, momentum_weight: state.momentumWeight, momentum_scale: DATA.model.momentum_scale, crowd_weight: DATA.model.crowd_weight, crowd_floor: DATA.model.crowd_floor, maturity_floor: state.maturityFloor, maturity_range: DATA.model.maturity_range, maturity_days: DATA.model.maturity_days, unknown_age_days: DATA.model.unknown_age_days, breadth_step: DATA.model.breadth_step, breadth_max_chains: DATA.model.breadth_max_chains };
    return impliedOf(row, m, state.catScale);
  }
  function shownImplied(row) { return state.sandbox ? sandboxImplied(row) : row.implied_value_usd; }

  // The table, the count and the sandbox note are the only parts that change while a reader types
  // or drags a slider, so they refresh in place: rebuilding the whole page on every keystroke
  // would steal the focus from the control being used.
  var tableSlot = null, countEl = null, sandboxNoteEl = null;
  function refreshTable() {
    if (tableSlot) { tableSlot.textContent = ''; tableSlot.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable()); }
    if (countEl) countEl.textContent = state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols';
    if (sandboxNoteEl) sandboxNoteEl.textContent = state.sandbox ? 'Sandbox is on: the table above is re-scored with your settings. The submitted board uses the stated constants; move a slider back to its default to restore it.' : 'The sandbox changes nothing in board.json: it re-scores the same rows with your settings so you can feel how the model behaves.';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', borrow a small amount against it, then repay the borrow.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and swap through it once a week.';
    if (c.indexOf('yield') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and leave the shares untouched.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ', then use the bridged funds in one app on the other side.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token in the same wallet.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ', open one small hedged position, then close it the same week.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one small market position on ' + name + ', then settle it before the market closes.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares for the full hold period.';
    if (c.indexOf('stable') >= 0 || c.indexOf('algo') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the same wallet.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it until the position matures.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active for the full hold period.';
    if (c.indexOf('launchpad') >= 0) return 'Stake $' + capital + ' on ' + name + ' to join its next launch, then claim any allocation it offers.';
    if (c.indexOf('ai') >= 0 || c.indexOf('agent') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and run one of its agent tasks each week.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Fund $' + capital + ' through ' + name + ' on ' + chain + ' and make one payment with it each week.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of ' + name + "'s index on " + chain + ' and hold the position for the full period.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: "Check the protocol's own site and its DefiLlama page first: it records no token today, so confirm no token or points program launched since the snapshot.", cost: 'nothing to check', time: '10 minutes' },
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the receipts.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('mintvl')) state.minTvl = Number(params.get('mintvl')) || 0;
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('mom') === '1') state.momentumOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('mintvl', String(state.minTvl));
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.momentumOnly) params.set('mom', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // A row is on the watchlist when its slug is in the snapshot's watchlist, carried in the data.
  function onWatchlist(r) { return !!WATCH[r.slug]; }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !onWatchlist(r)) return false;
      if (state.momentumOnly && r.momentum_multiplier < 1.05) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.minTvl && r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'momentum') { av = a.momentum_multiplier; bv = b.momentum_multiplier; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = shownImplied(a); bv = shownImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, and every rankable one above it the watchlist rule left out. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function movers() {
    var top = DATA.rows.filter(function (r) { return r.change_7d !== null; }).sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 5);
    var cards = top.map(function (r) {
      return el('button', { class: 'mover', type: 'button', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'grow', text: fmtPct(r.change_7d) + ' in 7d' }),
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: 'Rank ' + r.rank + ' · ' + fmtUsd(r.tvl_usd) + ' TVL' })
      );
    });
    return el('section', { class: 'movers' },
      el('div', { class: 'movers-label', text: 'Fastest growing this week — pre-token' }),
      cards
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 12);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); refreshTable(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); refreshTable(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); refreshTable(); });
    var tvlSel = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      [['0', 'Any TVL'], ['50000000', 'TVL $50M+'], ['100000000', 'TVL $100M+'], ['500000000', 'TVL $500M+'], ['1000000000', 'TVL $1B+']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: String(state.minTvl) === o[0] ? 'selected' : null });
      })
    );
    tvlSel.addEventListener('change', function () { state.minTvl = Number(tvlSel.value); writeHash(); refreshTable(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null, 'aria-label': 'Watchlist only' }),
      document.createTextNode('Watchlist only')
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; writeHash(); refreshTable(); });
    var mom = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.momentumOnly ? 'checked' : null, 'aria-label': 'High momentum only' }),
      document.createTextNode('High momentum only')
    );
    mom.querySelector('input').addEventListener('change', function (e) { state.momentumOnly = e.target.checked; writeHash(); refreshTable(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    countEl = el('span', { class: 'count', text: '' });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Min TVL' }), tvlSel),
      wl,
      mom,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      countEl
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } refreshTable(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchlistOnly = false; state.momentumOnly = false; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return shownImplied(r); })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var momentum = 'x' + r.momentum_multiplier.toFixed(2);
      var momentumClass = r.momentum_multiplier >= 1.05 ? 'pos' : r.momentum_multiplier < 1 ? 'neg' : '';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), onWatchlist(r) ? el('span', { class: 'watch', text: 'WATCH' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num ' + momentumClass, text: momentum }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownImplied(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownImplied(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' + (state.sandbox ? ' Sandbox is on: values are re-scored, not the submitted board.' : '') }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('momentum', 'Momentum'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var topMultis = DATA.categories.filter(function (c) { return c.peers >= 3; }).slice(0, 8);
    var topConc = (DATA.concentrations || []).slice(0, 8);
    var slider = function (id, label, min, max, step, value, format, set) {
      var input = el('input', { type: 'range', id: id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      var out = el('output', { for: id, text: format(value) });
      input.addEventListener('input', function () { set(Number(input.value)); state.sandbox = true; out.textContent = format(Number(input.value)); refreshTable(); });
      return el('label', { for: id }, label, input, out);
    };
    sandboxNoteEl = el('p', { class: 'sandbox-note', text: 'The sandbox changes nothing in board.json: it re-scores the same rows with your settings so you can feel how the model behaves.' });
    var panel = el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The category multiple is the median market-cap / TVL of the live-token protocols in that category (at least 3 peers, else the global median ' + DATA.global_multiple + '), clamped to 0.05–1.00.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x categoryMultiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (1 + ' + m.momentum_weight + ' x tanh(change_7d / ' + m.momentum_scale + ')) x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x min(chains - 1, 10)) x (1 - ' + m.crowd_weight + ' x HHI(category), floored at ' + m.crowd_floor + ') )'
      ),
      el('h3', { text: 'What-if sandbox — re-scores the board live' }),
      el('div', { class: 'sandbox' },
        slider('sb-cat', 'Category multiple scale', 0.5, 2, 0.05, state.catScale, function (v) { return 'x' + v.toFixed(2); }, function (v) { state.catScale = v; }),
        slider('sb-growth', 'Growth weight', 0, 1, 0.05, state.growthWeight, function (v) { return v.toFixed(2); }, function (v) { state.growthWeight = v; }),
        slider('sb-mom', 'Momentum weight', 0, 0.25, 0.01, state.momentumWeight, function (v) { return v.toFixed(2); }, function (v) { state.momentumWeight = v; }),
        slider('sb-mat', 'Maturity floor', 0.4, 0.8, 0.05, state.maturityFloor, function (v) { return v.toFixed(2); }, function (v) { state.maturityFloor = v; })
      ),
      sandboxNoteEl,
      el('button', { class: 'button', type: 'button', text: 'Reset sandbox', onclick: function () { state.sandbox = false; state.catScale = 1; state.growthWeight = DATA.model.growth_weight; state.momentumWeight = DATA.model.momentum_weight; state.maturityFloor = DATA.model.maturity_floor; render(); } }),
      el('h3', { text: 'Category multiples from live-token peers' }),
      el('div', { class: 'multis' }, topMultis.map(function (c) {
        return el('div', { class: 'multi' }, el('span', { text: c.category + ' (' + c.peers + ' peers)' }), el('b', { text: 'x' + c.multiple.toFixed(2) }));
      })),
      el('h3', { text: 'Category concentration — where the multiple is thinnest' }),
      el('div', { class: 'multis' }, topConc.map(function (c) {
        return el('div', { class: 'multi' }, el('span', { text: c.category + ' (HHI ' + c.hhi.toFixed(2) + ', ' + c.peers + ' peers)' }), el('b', { text: 'x' + c.multiplier.toFixed(2) }));
      })),
      el('p', { class: 'sub', text: 'HHI is the Herfindahl index of the live-token protocols in the category: the sum of their squared shares of the category TVL. A category whose multiple is set by one giant is discounted up to 20%; a diffuse category is barely discounted. Momentum is a bounded read of the week\'s move: a protocol that jumped 120% scores barely more than one that jumped 40%, and a sharp fall is marked down without being written off.' }),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A protocol on this board records no token in DefiLlama — that is the record, never proof it has none — and the implied value is this entry\u2019s own claim, never make.fun\u2019s. This board does not predict whether or when a token is issued.' })
    );
    return panel;
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model, 1);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (onWatchlist(row) ? ' · Watchlist' : ' · Early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: 'x' + row.category_multiple.toFixed(2) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Momentum multiplier' }), el('b', { class: 'num', text: String(row.momentum_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', null, el('span', { text: 'Crowding multiplier' }), el('b', { class: 'num', text: String(row.crowd_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    tableSlot = null; countEl = null; sandboxNoteEl = null;
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(movers());
    shell.appendChild(controls());
    tableSlot = el('div');
    shell.appendChild(tableSlot);
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    refreshTable();
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
