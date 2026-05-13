// ── STATE ──
const today = new Date();
let shows = [];
let nextId = 1;
let calY = today.getFullYear();
let calM = today.getMonth();
let selSt = 'confirmed';
let selPaySt = 'pending';
let editingId = null;
let previewShowId = null;
let confirmCallback = null;
let saveTimer = null;

const MO = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BC = {wedding:'wedding',pub:'pub',corporate:'corporate',college:'college',festival:'festival',other:'other'};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
const isPast = s => new Date(s.year, s.month, s.day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
const isThisMonth = s => s.year === today.getFullYear() && s.month === today.getMonth();

function setSyncStatus(state, label) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (dot) dot.className = 'sync-dot ' + state;
  if (lbl) lbl.textContent = label;
}

async function initApp() {
  setSyncStatus('saving', 'Loading...');
  document.getElementById('loading-screen').classList.remove('hidden');
  try {
    const data = await loadFromDrive();
    if (data && data.shows) {
      shows = data.shows;
      nextId = shows.length > 0 ? Math.max(...shows.map(s => s.id)) + 1 : 1;
      setSyncStatus('saved', 'Synced ✓');
    } else {
      shows = [];
      setSyncStatus('saved', 'Ready');
    }
  } catch(e) {
    shows = [];
    setSyncStatus('error', 'Load failed');
  }
  document.getElementById('loading-screen').classList.add('hidden');
  rebuildDashboard();
  setupEventListeners();
}

async function saveData() {
  setSyncStatus('saving', 'Saving...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const ok = await saveToDriveNative({ shows, lastUpdated: new Date().toISOString() });
      setSyncStatus(ok ? 'saved' : 'error', ok ? 'Saved ✓' : 'Save failed');
    } catch(e) { setSyncStatus('error', 'Save failed'); }
  }, 1500);
}

// ── TAB NAVIGATION ──
function switchTab(tab, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  el.classList.add('active');
  closePreview(); closeConfirm();
  if (tab === 'calendar') renderCal();
  if (tab === 'dashboard') rebuildDashboard();
  if (tab === 'earnings') rebuildEarnings();
}

function showSection(sec) {
  document.getElementById('tab-upcoming').classList.toggle('active', sec === 'upcoming');
  document.getElementById('tab-completed').classList.toggle('active', sec === 'completed');
  document.getElementById('list-upcoming').style.display = sec === 'upcoming' ? '' : 'none';
  document.getElementById('list-completed').style.display = sec === 'completed' ? '' : 'none';
}

// ── CONFIRM POPUP ──
function showConfirm(msg, anchorEl, cb) {
  confirmCallback = cb;
  document.getElementById('confirm-msg').textContent = msg;
  const popup = document.getElementById('confirm-popup');
  const appRect = document.getElementById('app').getBoundingClientRect();
  const elRect = anchorEl.getBoundingClientRect();
  let top = elRect.bottom - appRect.top + 6;
  let left = elRect.left - appRect.left;
  if (left + 220 > appRect.width) left = appRect.width - 224;
  if (left < 4) left = 4;
  if (top + 120 > appRect.height) top = elRect.top - appRect.top - 120;
  popup.style.top = top + 'px'; popup.style.left = left + 'px';
  popup.classList.add('show');
}
function closeConfirm() {
  document.getElementById('confirm-popup').classList.remove('show');
  confirmCallback = null;
}

// ── PAYMENT ──
function pillClass(s) {
  if (s.payStatus === 'paid') return 'paid';
  if (isPast(s)) return 'pending';
  return 'upcoming';
}
function pillLabel(s) {
  if (s.payStatus === 'paid') return '✓ Paid';
  if (isPast(s)) return '⏳ Pending';
  return 'Upcoming';
}
function togglePayment(showId, btn) {
  const s = shows.find(x => x.id === showId); if (!s) return;
  const past = isPast(s);
  let newStatus, msg;
  if (!past) { newStatus = s.payStatus === 'paid' ? 'upcoming' : 'paid'; msg = newStatus === 'paid' ? 'Mark as Paid?' : 'Mark as Upcoming?'; }
  else { newStatus = s.payStatus === 'paid' ? 'pending' : 'paid'; msg = newStatus === 'paid' ? 'Mark as Paid?' : 'Mark as Pending?'; }
  showConfirm(msg, btn, () => { s.payStatus = newStatus; rebuildDashboard(); rebuildEarnings(); saveData(); });
}

// ── SHOW ROW ──
function makeShowRow(s) {
  const past = isPast(s);
  const row = document.createElement('div');
  row.className = 'show-row' + (past ? ' past' : '');
  const tentTag = s.status === 'tentative' ? `<span class="tentative-tag">· tentative</span>` : '';
  const pc = pillClass(s); const pl = pillLabel(s);
  row.innerHTML = `
    <div class="${past ? 'date-pip past-pip' : 'date-pip'}">
      <div class="mo">${MS[s.month]}</div><div class="dy">${s.day}</div>
    </div>
    <div class="show-body">
      <div class="artist-line"><span class="show-artist">${s.artist}</span>${tentTag}</div>
      <div class="show-meta"><span class="badge ${BC[s.type]||'other'}">${cap(s.type)}</span><span class="mdot">·</span><span>${s.city}</span></div>
    </div>
    <div class="show-right">
      <div class="pay-amount">${fmt(s.pay)}</div>
      <button class="pay-marker ${pc}">${pl}</button>
    </div>`;
  row.querySelector('.pay-marker').addEventListener('click', function(e) { e.stopPropagation(); togglePayment(s.id, this); });
  return row;
}

// ── GROUP BY MONTH ──
function groupByMonth(list) {
  const groups = {};
  list.forEach(s => {
    const key = `${s.year}-${String(s.month).padStart(2,'0')}`;
    if (!groups[key]) groups[key] = { label: MO[s.month] + ' ' + s.year, shows: [], total: 0 };
    groups[key].shows.push(s);
    groups[key].total += s.pay;
  });
  return groups;
}

function renderGroupedList(container, list, emptyMsg) {
  container.innerHTML = '';
  if (!list.length) { container.innerHTML = `<div class="empty-state">${emptyMsg}</div>`; return; }
  const groups = groupByMonth(list);
  Object.keys(groups).forEach(key => {
    const g = groups[key];
    const header = document.createElement('div');
    header.className = 'month-group-header';
    header.innerHTML = `<span class="month-group-label">${g.label}</span><span class="month-group-total">${fmt(g.total)}</span>`;
    container.appendChild(header);
    g.shows.forEach(s => container.appendChild(makeShowRow(s)));
  });
}

// ── DASHBOARD ──
function rebuildDashboard() {
  const sorted = [...shows].sort((a, b) => new Date(a.year, a.month, a.day) - new Date(b.year, b.month, b.day));
  const upcoming = sorted.filter(s => !isPast(s));
  const completed = sorted.filter(s => isPast(s)).reverse();

  // Projected income this month = all gigs in current month
  const thisMonthShows = shows.filter(isThisMonth);
  const projectedThisMonth = thisMonthShows.reduce((a, s) => a + s.pay, 0);
  const next = upcoming[0];

  document.getElementById('s-count').textContent = upcoming.length || '0';
  document.getElementById('s-earn').textContent = fmt(projectedThisMonth);
  document.getElementById('s-month-label').textContent = MO[today.getMonth()] + ' ' + today.getFullYear();

  if (next) {
    document.getElementById('s-next').textContent = MS[next.month] + ' ' + next.day;
    document.getElementById('s-next-d').textContent = next.artist.split(' ')[0] + ' · ' + next.city;
  } else {
    document.getElementById('s-next').textContent = '—';
    document.getElementById('s-next-d').textContent = 'No upcoming gigs';
  }

  // Upcoming — grouped by month ascending
  renderGroupedList(document.getElementById('list-upcoming'), upcoming, 'No upcoming gigs — tap <strong>Add Gig</strong>');
  // Completed — grouped by month, most recent first
  renderGroupedList(document.getElementById('list-completed'), completed, 'No completed gigs yet');
}

// ── EARNINGS ANALYTICS ──
function rebuildEarnings() {
  const yr = today.getFullYear();

  // This month
  const tmShows = shows.filter(isThisMonth);
  const tmEarned = tmShows.filter(s => isPast(s) && s.payStatus === 'paid').reduce((a, s) => a + s.pay, 0);
  const tmProjected = tmShows.reduce((a, s) => a + s.pay, 0);
  const tmConfirmed = tmShows.filter(s => s.status === 'confirmed').reduce((a, s) => a + s.pay, 0);
  const tmTentative = tmShows.filter(s => s.status === 'tentative').reduce((a, s) => a + s.pay, 0);

  document.getElementById('e-earned').textContent = fmt(tmEarned);
  document.getElementById('e-projected').textContent = fmt(tmProjected);
  document.getElementById('e-confirmed').textContent = fmt(tmConfirmed);
  document.getElementById('e-tentative').textContent = fmt(tmTentative);

  // Monthly bar chart — Jan to Dec of current year
  const monthlyTotals = Array(12).fill(0);
  const monthlyConfirmed = Array(12).fill(0);
  const monthlyTentative = Array(12).fill(0);
  shows.filter(s => s.year === yr).forEach(s => {
    monthlyTotals[s.month] += s.pay;
    if (s.status === 'confirmed') monthlyConfirmed[s.month] += s.pay;
    else monthlyTentative[s.month] += s.pay;
  });

  const maxVal = Math.max(...monthlyTotals, 1);
  const barChart = document.getElementById('e-bar-chart');
  barChart.innerHTML = '';
  monthlyTotals.forEach((val, i) => {
    const conf = monthlyConfirmed[i];
    const tent = monthlyTentative[i];
    const confH = Math.round((conf / maxVal) * 100);
    const tentH = Math.round((tent / maxVal) * 100);
    const isNow = i === today.getMonth();
    const col = document.createElement('div');
    col.className = 'bar-col' + (isNow ? ' bar-now' : '');
    col.innerHTML = `
      <div class="bar-wrap">
        <div class="bar-tent" style="height:${tentH}%"></div>
        <div class="bar-conf" style="height:${confH}%"></div>
      </div>
      <div class="bar-label">${MS[i]}</div>`;
    col.title = `${MO[i]}: ${fmt(val)}`;
    barChart.appendChild(col);
  });

  // Gig type breakdown
  const typeMap = {};
  shows.forEach(s => { typeMap[s.type] = (typeMap[s.type] || 0) + s.pay; });
  const typeList = document.getElementById('e-type-list');
  typeList.innerHTML = '';
  const totalPay = shows.reduce((a, s) => a + s.pay, 0) || 1;
  const typeColors = { wedding: '#993556', corporate: '#534AB7', festival: '#1D9E75', pub: '#3B6D11', college: '#993C1D', other: '#6b7280' };
  Object.entries(typeMap).sort((a, b) => b[1] - a[1]).forEach(([type, amt]) => {
    const pct = Math.round((amt / totalPay) * 100);
    const row = document.createElement('div');
    row.className = 'type-row';
    row.innerHTML = `
      <div class="type-dot" style="background:${typeColors[type]||'#6b7280'}"></div>
      <span class="type-name">${cap(type)}</span>
      <div class="type-bar-wrap"><div class="type-bar-fill" style="width:${pct}%;background:${typeColors[type]||'#6b7280'}"></div></div>
      <span class="type-amt">${fmt(amt)}</span>`;
    typeList.appendChild(row);
  });

  // Year total
  const yearTotal = shows.filter(s => s.year === yr).reduce((a, s) => a + s.pay, 0);
  const yearPaid = shows.filter(s => s.year === yr && s.payStatus === 'paid').reduce((a, s) => a + s.pay, 0);
  document.getElementById('e-year-total').textContent = fmt(yearTotal);
  document.getElementById('e-year-paid').textContent = fmt(yearPaid);
  document.getElementById('e-year-pending').textContent = fmt(yearTotal - yearPaid);
  document.getElementById('e-gig-count').textContent = shows.filter(s => s.year === yr).length;
  document.getElementById('e-avg').textContent = fmt(shows.length ? Math.round(yearTotal / shows.filter(s => s.year === yr).length) : 0);
}

// ── SHEET ──
function setSt(s) { selSt = s; document.getElementById('bc').className = 'tog-btn' + (s === 'confirmed' ? ' sel-c' : ''); document.getElementById('bt').className = 'tog-btn' + (s === 'tentative' ? ' sel-t' : ''); }
function setPaySt(s) { selPaySt = s; document.getElementById('bp-paid').className = 'pay-tog' + (s === 'paid' ? ' sel-paid' : ''); document.getElementById('bp-pending').className = 'pay-tog' + (s === 'pending' ? ' sel-pending' : ''); }

function openAdd(prefillDate) {
  editingId = null;
  document.getElementById('sheet-title').textContent = 'Add a new gig';
  ['fa','fc','fp','fn'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ft').value = 'wedding';
  document.getElementById('fd').value = prefillDate || '';
  setSt('confirmed'); setPaySt('pending');
  document.getElementById('save-btn').textContent = '💾 Save Gig';
  document.getElementById('delete-wrap').innerHTML = '';
  document.getElementById('toast').classList.remove('show');
  openSheet();
}
function openEdit(showId) {
  const s = shows.find(x => x.id === showId); if (!s) return;
  editingId = s.id;
  document.getElementById('sheet-title').textContent = 'Edit gig';
  document.getElementById('fa').value = s.artist;
  document.getElementById('ft').value = s.type;
  document.getElementById('fd').value = `${s.year}-${String(s.month+1).padStart(2,'0')}-${String(s.day).padStart(2,'0')}`;
  document.getElementById('fc').value = s.city;
  document.getElementById('fp').value = s.pay || '';
  document.getElementById('fn').value = s.notes || '';
  setSt(s.status); setPaySt(s.payStatus === 'upcoming' ? 'pending' : s.payStatus);
  document.getElementById('save-btn').textContent = '✓ Save changes';
  document.getElementById('delete-wrap').innerHTML = '<button class="del-btn" id="del-btn">🗑 Delete gig</button>';
  document.getElementById('del-btn').addEventListener('click', deleteShow);
  document.getElementById('toast').classList.remove('show');
  openSheet();
}
function openEditFromPreview() { const id = previewShowId; closePreview(); openEdit(id); }
function openSheet() { document.getElementById('overlay').classList.add('show'); }
function closeSheet() { document.getElementById('overlay').classList.remove('show'); }

async function saveShow() {
  const artist = document.getElementById('fa').value.trim();
  const type = document.getElementById('ft').value;
  const date = document.getElementById('fd').value;
  const city = document.getElementById('fc').value.trim();
  const pay = parseInt(document.getElementById('fp').value) || 0;
  const notes = document.getElementById('fn').value.trim();
  const calSync = document.getElementById('cs').checked;
  if (!artist || !date) { alert('Please enter at least a name and date.'); return; }
  const d = new Date(date + 'T00:00:00');
  const mo = d.getMonth(), dy = d.getDate(), yr = d.getFullYear();
  const isUpcoming = new Date(yr, mo, dy) >= new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const computedPayStatus = isUpcoming && selPaySt === 'pending' ? 'upcoming' : selPaySt;
  if (editingId) {
    const idx = shows.findIndex(s => s.id === editingId);
    const existingCalId = shows[idx].calEventId || null;
    const updated = { id: editingId, year: yr, month: mo, day: dy, artist, type, city, pay, status: selSt, payStatus: computedPayStatus, notes, calEventId: existingCalId };
    shows[idx] = updated;
    showToast('Changes saved!'); rebuildDashboard(); saveData();
    if (calSync && existingCalId) updateCalendarEventNative(updated);
    else if (calSync && !existingCalId) { const eid = await createCalendarEventNative(updated); if (eid) { shows[idx].calEventId = eid; saveData(); } }
  } else {
    const newGig = { id: nextId++, year: yr, month: mo, day: dy, artist, type, city, pay, status: selSt, payStatus: computedPayStatus, notes, calEventId: null };
    shows.push(newGig);
    showToast('Gig saved!'); rebuildDashboard(); saveData();
    if (calSync) { const eid = await createCalendarEventNative(newGig); if (eid) { const idx = shows.findIndex(s => s.id === newGig.id); if (idx > -1) { shows[idx].calEventId = eid; saveData(); } } }
  }
  setTimeout(() => { closeSheet(); if (document.getElementById('panel-calendar').classList.contains('active')) renderCal(); }, 1400);
}

async function deleteShow() {
  if (!editingId) return;
  if (!confirm('Delete this gig? This cannot be undone.')) return;
  const idx = shows.findIndex(s => s.id === editingId);
  if (idx > -1) {
    const calId = shows[idx].calEventId;
    shows.splice(idx, 1);
    rebuildDashboard(); saveData(); closeSheet();
    if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
    if (calId) deleteCalendarEventNative(calId);
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = '✓ ' + msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1400);
}

// ── CALENDAR ──
function showPreview(showId, dayEl) {
  const s = shows.find(x => x.id === showId); if (!s) return;
  if (previewShowId === showId) { closePreview(); return; }
  previewShowId = showId;
  document.getElementById('pv-artist').textContent = s.artist;
  const b = document.getElementById('pv-badge'); b.textContent = cap(s.type); b.className = 'badge ' + (BC[s.type]||'other');
  document.getElementById('pv-city').textContent = s.city;
  document.getElementById('pv-date').textContent = `${s.day} ${MS[s.month]} ${s.year}`;
  const pe = document.getElementById('pv-pay');
  pe.textContent = fmt(s.pay) + (s.status === 'tentative' ? ' (tentative)' : '');
  pe.className = 'pv-pay' + (s.status === 'tentative' ? ' dim' : '');
  const card = document.getElementById('preview');
  const pr = document.getElementById('panel-calendar').getBoundingClientRect();
  const dr = dayEl.getBoundingClientRect(); const cp = document.getElementById('panel-calendar');
  let top = dr.bottom - pr.top + cp.scrollTop + 4; let left = dr.left - pr.left;
  if (left + 240 > pr.width) left = pr.width - 244; if (left < 4) left = 4;
  if (top + 200 > pr.height) top = dr.top - pr.top + cp.scrollTop - 210;
  card.style.top = top + 'px'; card.style.left = left + 'px'; card.classList.add('show');
  document.querySelectorAll('.cday.selected').forEach(d => d.classList.remove('selected'));
  dayEl.classList.add('selected');
}
function closePreview() {
  previewShowId = null;
  const p = document.getElementById('preview'); if (p) p.classList.remove('show');
  document.querySelectorAll('.cday.selected').forEach(d => d.classList.remove('selected'));
}

function renderCal() {
  closePreview();
  document.getElementById('cal-title').textContent = MO[calM] + ' ' + calY;
  const g = document.getElementById('cal-grid'); g.innerHTML = '';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => { const e = document.createElement('div'); e.className = 'dow'; e.textContent = d; g.appendChild(e); });
  const first = new Date(calY, calM, 1).getDay(); const dim = new Date(calY, calM+1, 0).getDate(); const dip = new Date(calY, calM, 0).getDate();
  const ms = shows.filter(s => s.year === calY && s.month === calM); const sd = {};
  ms.forEach(s => { if (!sd[s.day]) sd[s.day] = []; sd[s.day].push(s); });
  for (let i = 0; i < first; i++) { const e = document.createElement('div'); e.className = 'cday other'; e.innerHTML = `<div class="dnum">${dip-first+1+i}</div>`; g.appendChild(e); }
  for (let d = 1; d <= dim; d++) {
    const e = document.createElement('div'); e.className = 'cday';
    if (today.getFullYear()===calY && today.getMonth()===calM && today.getDate()===d) e.classList.add('today');
    e.innerHTML = `<div class="dnum">${d}</div>`;
    if (sd[d]) {
      e.classList.add('hasshow');
      const dr = document.createElement('div'); dr.className = 'dots-row';
      sd[d].forEach(s => { const dot = document.createElement('div'); dot.className = 'sdot'+(s.status==='tentative'?' t':''); dr.appendChild(dot); });
      e.appendChild(dr);
      const sid = sd[d][0].id; e.addEventListener('click', ev => { ev.stopPropagation(); showPreview(sid, e); });
    } else { e.addEventListener('click', ev => { ev.stopPropagation(); const dd = `${calY}-${String(calM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; openAdd(dd); }); }
    g.appendChild(e);
  }
  const rem = (7-(first+dim)%7)%7; for (let i = 1; i <= rem; i++) { const e = document.createElement('div'); e.className = 'cday other'; e.innerHTML = `<div class="dnum">${i}</div>`; g.appendChild(e); }
  const conf = ms.filter(s => s.status==='confirmed').length; const earn = ms.reduce((a,s) => a+s.pay, 0);
  document.getElementById('cc').textContent = ms.length||'—'; document.getElementById('ccf').textContent = conf||'—'; document.getElementById('ce').textContent = ms.length?fmt(earn):'—';
  const ag = document.getElementById('agenda'); ag.innerHTML = '';
  if (ms.length) {
    const h = document.createElement('div'); h.className = 'sec-label'; h.style.marginTop = '14px'; h.textContent = 'This month'; ag.appendChild(h);
    [...ms].sort((a,b)=>a.day-b.day).forEach(s => {
      const row = document.createElement('div'); row.className = 'agenda-item';
      row.innerHTML = `<span class="ag-date">${MS[s.month]} ${s.day}</span><span class="ag-artist">${s.artist}</span><span class="badge ${BC[s.type]||'other'}" style="font-size:10px">${cap(s.type)}</span><span class="ag-pay">${fmt(s.pay)}</span>`;
      row.addEventListener('click', () => openEdit(s.id)); ag.appendChild(row);
    });
  }
}

// ── CHAT ──
async function sendMsg() {
  const inp = document.getElementById('cin'); const text = inp.value.trim(); if (!text) return;
  inp.value = ''; inp.style.height = 'auto';
  const msgs = document.getElementById('chat-msgs');
  const u = document.createElement('div'); u.className = 'msg user';
  u.innerHTML = `<div class="av"><i class="ti ti-user"></i></div><div class="bub">${text}</div>`;
  msgs.appendChild(u); msgs.scrollTop = msgs.scrollHeight;
  document.getElementById('tdots').classList.add('show');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: `You are Musician's Friend, a warm personal assistant for a musician in India. Be concise and friendly. Use ₹ for currency. Current gigs: ${JSON.stringify(shows)}. If the user mentions a new gig, suggest tapping the Add Gig button.`, messages: [{role:'user',content:text}] }) });
    const data = await res.json(); const reply = data.content?.[0]?.text || "Could you rephrase that?";
    document.getElementById('tdots').classList.remove('show');
    const b = document.createElement('div'); b.className = 'msg bot';
    b.innerHTML = `<div class="av"><i class="ti ti-music"></i></div><div class="bub">${reply}</div>`;
    msgs.appendChild(b); msgs.scrollTop = msgs.scrollHeight;
  } catch(e) {
    document.getElementById('tdots').classList.remove('show');
    const b = document.createElement('div'); b.className = 'msg bot';
    b.innerHTML = `<div class="av"><i class="ti ti-music"></i></div><div class="bub">Sorry, had a hiccup! Try again.</div>`;
    msgs.appendChild(b);
  }
}

// ── EVENT LISTENERS ──
function setupEventListeners() {
  document.getElementById('fab').addEventListener('click', () => openAdd());
  document.getElementById('bc').addEventListener('click', () => setSt('confirmed'));
  document.getElementById('bt').addEventListener('click', () => setSt('tentative'));
  document.getElementById('bp-paid').addEventListener('click', () => setPaySt('paid'));
  document.getElementById('bp-pending').addEventListener('click', () => setPaySt('pending'));
  document.getElementById('save-btn').addEventListener('click', saveShow);
  document.getElementById('overlay').addEventListener('click', e => { if (e.target === document.getElementById('overlay')) closeSheet(); });
  document.getElementById('cal-prev').addEventListener('click', e => { e.stopPropagation(); calM--; if (calM<0){calM=11;calY--;} renderCal(); });
  document.getElementById('cal-next').addEventListener('click', e => { e.stopPropagation(); calM++; if (calM>11){calM=0;calY++;} renderCal(); });
  document.getElementById('panel-calendar').addEventListener('click', e => { if (!e.target.closest('.preview-card') && !e.target.closest('.cday')) closePreview(); });
  document.getElementById('pv-close').addEventListener('click', closePreview);
  document.getElementById('pv-edit').addEventListener('click', openEditFromPreview);
  document.getElementById('confirm-yes').addEventListener('click', () => { if (confirmCallback) confirmCallback(); closeConfirm(); });
  document.getElementById('confirm-no').addEventListener('click', closeConfirm);
  document.addEventListener('click', e => { if (!e.target.closest('.confirm-popup') && !e.target.closest('.pay-marker')) closeConfirm(); });
  document.getElementById('send-btn').addEventListener('click', sendMsg);
  document.getElementById('cin').addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();} });
  document.getElementById('cin').addEventListener('input', function() { this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,80)+'px'; });
}
