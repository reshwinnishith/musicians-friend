const today = new Date();
let shows = [];
let nextId = 1;
let calY = today.getFullYear();
let calM = today.getMonth();
let selSt = 'confirmed';
let selPaySt = 'pending';
let selSlot = '';
let editingId = null;
let previewShowId = null;
let confirmCallback = null;
let saveTimer = null;
let moreDetailsOpen = false;
let showRehearsals = localStorage.getItem('mf_show_rehearsals') !== 'false'; // default true
let privacyMode = localStorage.getItem('mf_privacy') === 'true';

function applyPrivacyMode() {
  const icon = document.getElementById('privacy-icon');
  const btn = document.getElementById('privacy-btn');
  if (icon) icon.className = privacyMode ? 'ti ti-eye-off' : 'ti ti-eye';
  if (btn) btn.classList.toggle('active', privacyMode);
}

function togglePrivacy() {
  privacyMode = !privacyMode;
  localStorage.setItem('mf_privacy', privacyMode);
  applyPrivacyMode();
  rebuildDashboard();
  if (document.getElementById('panel-earnings').classList.contains('active')) rebuildEarnings();
  if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
}

function showOfflineBanner() {
  const existing = document.getElementById('offline-banner');
  if (existing) return;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.className = 'offline-banner';
  banner.innerHTML = '<i class="ti ti-wifi-off"></i> Offline — showing last synced data';
  const content = document.getElementById('app');
  if (content) content.insertBefore(banner, content.firstChild);
}

function hideOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.remove();
}

const MO = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BC = {wedding:'wedding',pub:'pub',corporate:'corporate',college:'college',festival:'festival',other:'other'};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
function formatAmount(n) { return privacyMode ? '₹••••••' : fmt(n); }
const isPast = s => new Date(s.year, s.month, s.day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
const isThisMonth = s => s.year === today.getFullYear() && s.month === today.getMonth();
const isRehearsal = s => s.eventType === 'rehearsal';
const isGig = s => s.eventType !== 'rehearsal';
function rhTitle(r) {
  if (r.artist && r.jampad) return `${r.artist} — ${r.jampad}`;
  if (r.artist) return r.artist;
  if (r.jampad) return `Rehearsal — ${r.jampad}`;
  return 'Rehearsal';
}

// ── DEFAULT LISTS ──
const DEFAULT_GIG_TYPES = ['Wedding','Pub','Corporate','College','Festival','Other'];
let customGigTypes = JSON.parse(localStorage.getItem('mf_gig_types') || '[]');
let customCities = JSON.parse(localStorage.getItem('mf_cities') || '[]');
function getAllGigTypes() { return [...new Set([...DEFAULT_GIG_TYPES, ...customGigTypes])]; }
function getAllClients() { return [...new Set(shows.filter(isGig).map(s => s.artist).filter(Boolean))]; }
function getAllCities() { return [...new Set([...shows.filter(isGig).map(s => s.city).filter(Boolean), ...customCities])]; }
function getAllJampads() { return [...new Set(shows.filter(isRehearsal).map(s => s.jampad).filter(Boolean))]; }
function getLinkedRehearsals(gigId) { return shows.filter(s => isRehearsal(s) && s.linkedGigId === gigId).sort((a,b) => new Date(a.year,a.month,a.day)-new Date(b.year,b.month,b.day)); }
function getUpcomingGigs() { return shows.filter(s => isGig(s) && !isPast(s)).sort((a,b) => new Date(a.year,a.month,a.day)-new Date(b.year,b.month,b.day)); }

// ── SYNC STATUS ──
function setSyncStatus(state, label) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (dot) dot.className = 'sync-dot ' + state;
  if (lbl) lbl.textContent = label;
}

// ── INIT ──
async function initApp() {
  setSyncStatus('saving', 'Loading...');
  document.getElementById('loading-screen').classList.remove('hidden');
  const mn = document.getElementById('earn-month-name');
  if (mn) mn.textContent = MO[today.getMonth()] + ' ' + today.getFullYear();
  try {
    const data = await loadFromDrive();
    if (data && data.shows) {
      shows = data.shows;
      nextId = shows.length > 0 ? Math.max(...shows.map(s => s.id)) + 1 : 1;
      localStorage.setItem('mf_cached_shows', JSON.stringify(shows));
      localStorage.setItem('mf_cache_time', Date.now().toString());
      setSyncStatus('saved', 'Synced ✓');
    } else {
      const cached = localStorage.getItem('mf_cached_shows');
      if (cached) {
        try {
          shows = JSON.parse(cached);
          nextId = shows.length > 0 ? Math.max(...shows.map(s => s.id)) + 1 : 1;
          setSyncStatus('saved', 'Ready');
        } catch(e2) { shows = []; setSyncStatus('saved', 'Ready'); }
      } else { shows = []; setSyncStatus('saved', 'Ready'); }
    }
  } catch(e) {
    console.log('Drive load failed, checking cache. Error:', e);
    const cached = localStorage.getItem('mf_cached_shows');
    console.log('Cached shows found:', cached ? 'yes, length=' + cached.length : 'no');
    if (cached) {
      try {
        shows = JSON.parse(cached);
        nextId = shows.length > 0 ? Math.max(...shows.map(s => s.id)) + 1 : 1;
        setSyncStatus('error', 'Offline — showing cached data');
        showOfflineBanner();
      } catch(e2) {
        shows = [];
        setSyncStatus('error', 'Offline');
      }
    } else {
      shows = [];
      setSyncStatus('error', 'Offline — no cached data');
      showOfflineBanner();
    }
  }
  document.getElementById('loading-screen').classList.add('hidden');
  rebuildDashboard();
  setupEventListeners();
  applyPrivacyMode();
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

// ── TAB / FAB VISIBILITY ──
function switchTab(tab, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  el.classList.add('active');
  closePreview(); closeConfirm(); closeFabMenu();
  const fab = document.getElementById('fab');
  if (fab) fab.style.display = (tab === 'dashboard' || tab === 'calendar') ? 'flex' : 'none';
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

// ── REHEARSAL TOGGLE ──
function toggleRehearsalVisibility() {
  showRehearsals = !showRehearsals;
  localStorage.setItem('mf_show_rehearsals', showRehearsals);
  updateRehearsalToggleBtn();
  rebuildDashboard();
}
function updateRehearsalToggleBtn() {
  const btn = document.getElementById('rehearsal-toggle-btn');
  if (!btn) return;
  btn.classList.toggle('rh-toggle-active', showRehearsals);
}

// ── FAB ACTION SHEET ──
function openFabMenu() {
  const menu = document.getElementById('fab-menu');
  const fab = document.getElementById('fab');
  const backdrop = document.getElementById('fab-backdrop');
  if (menu) menu.classList.add('show');
  if (fab) fab.classList.add('fab-open');
  if (backdrop) backdrop.classList.add('show');
}
function closeFabMenu() {
  const menu = document.getElementById('fab-menu');
  const fab = document.getElementById('fab');
  const backdrop = document.getElementById('fab-backdrop');
  if (menu) menu.classList.remove('show');
  if (fab) fab.classList.remove('fab-open');
  if (backdrop) backdrop.classList.remove('show');
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

// ── STATUS COLOURS ──
function pillClass(s) {
  if (isRehearsal(s)) return 'pill-rehearsal'; // rehearsals have no status
  if (s.payStatus === 'paid') return 'pill-paid';
  if (isPast(s)) return 'pill-pending';
  if (s.status === 'tentative') return 'pill-tentative';
  return 'pill-upcoming';
}
function pillLabel(s) {
  if (isRehearsal(s)) return '🥁 Rehearsal';
  if (s.payStatus === 'paid') return '✓ Paid';
  if (isPast(s)) return '⏳ Pending';
  if (s.status === 'tentative') return '⏰ Tentative';
  return 'Upcoming';
}
function gigStatusClass(s) {
  if (isRehearsal(s)) return s.status === 'tentative' ? 'status-tentative' : 'status-confirmed';
  if (isPast(s)) return 'status-completed';
  if (s.status === 'tentative') return 'status-tentative';
  return 'status-confirmed';
}

function togglePayment(showId, btn) {
  const s = shows.find(x => x.id === showId); if (!s) return;
  const past = isPast(s);
  let newStatus, msg;
  if (!past) { newStatus = s.payStatus === 'paid' ? 'upcoming' : 'paid'; msg = newStatus === 'paid' ? 'Mark as Paid?' : 'Mark as Upcoming?'; }
  else { newStatus = s.payStatus === 'paid' ? 'pending' : 'paid'; msg = newStatus === 'paid' ? 'Mark as Paid?' : 'Mark as Pending?'; }
  showConfirm(msg, btn, () => { s.payStatus = newStatus; rebuildDashboard(); rebuildEarnings(); saveData(); });
}

// ── SHOW / REHEARSAL ROW ──
function makeShowRow(s) {
  const past = isPast(s);
  const row = document.createElement('div');
  const isToday = s.year === today.getFullYear() && s.month === today.getMonth() && s.day === today.getDate();
  row.className = 'show-row' + (past ? ' past' : '') + (isToday ? ' today-gig' : '') + (isRehearsal(s) ? ' show-row--rehearsal' : '');
  const sc = gigStatusClass(s);
  const pc = pillClass(s);
  const pl = pillLabel(s);

  if (isRehearsal(s)) {
    // Rehearsal card — simpler, no payment
    const linkedGig = s.linkedGigId ? shows.find(g => g.id === s.linkedGigId) : null;
    const linkTag = linkedGig ? `<div class="rh-link-tag"><i class="ti ti-arrow-right"></i> ${linkedGig.artist}, ${MS[linkedGig.month]} ${linkedGig.day}</div>` : '';
    const primaryName = s.artist || 'Rehearsal';
    const venueSecondary = s.jampad ? `<div class="rh-meta-line">${s.jampad}</div>` : '';
    row.innerHTML = `
      <div class="swipe-card-inner">
        <div class="date-pip ${sc}">
          <div class="mo">${MS[s.month]}</div><div class="dy">${s.day}</div>
        </div>
        <div class="show-body">
          <div class="artist-line"><span class="show-artist">${primaryName}</span></div>
          ${venueSecondary}
          <div class="show-meta"><span class="badge rehearsal-badge"><i class="ti ti-microphone-2"></i> Rehearsal</span>${s.notes ? `<span class="mdot">·</span><span style="font-size:11px;color:var(--muted)">${s.notes}</span>` : ''}</div>
          ${linkTag}
        </div>
        <div class="show-right">
          <span class="pay-marker pill-rehearsal"><i class="ti ti-microphone-2"></i></span>
        </div>
      </div>`;
  } else {
    const tentTag = s.status === 'tentative' ? `<span class="tentative-tag">· tentative</span>` : '';
    const linkedRh = getLinkedRehearsals(s.id);
    const rhChip = linkedRh.length > 0 ? `<div class="rh-count-chip"><i class="ti ti-microphone-2"></i> ${linkedRh.length} rehearsal${linkedRh.length>1?'s':''}</div>` : '';
    row.innerHTML = `
      <div class="swipe-card-inner">
        <div class="date-pip ${sc}">
          <div class="mo">${MS[s.month]}</div><div class="dy">${s.day}</div>
        </div>
        <div class="show-body">
          <div class="artist-line"><span class="show-artist">${s.artist}</span>${tentTag}${isToday ? '<span class="today-gig-badge">Today</span>' : ''}</div>
          <div class="show-meta"><span class="badge ${BC[s.type]||'other'}">${cap(s.type)}</span><span class="mdot">·</span><span>${s.city}</span></div>
          ${rhChip}
        </div>
        <div class="show-right">
          <div class="pay-amount financial-value">${formatAmount(s.pay)}</div>
          <button class="pay-marker ${pc}">${pl}</button>
        </div>
      </div>`;
    row.querySelector('.pay-marker').addEventListener('click', function(e) { e.stopPropagation(); togglePayment(s.id, this); });
  }

  const cardInner = row.querySelector('.swipe-card-inner');

  // Tap to edit
  cardInner.addEventListener('click', (e) => {
    if (e.target.closest('.pay-marker')) return;
    if (isRehearsal(s)) openEditRehearsal(s.id);
    else openEdit(s.id);
  });

  // ── SWIPE → MODAL ──
  // Simplest possible implementation — pure variable tracking, no DOM reads
  let _x0 = 0, _y0 = 0, _dx = 0, _swiping = false;
  const THRESHOLD = 50;

  row.addEventListener('touchstart', (e) => {
    _x0 = e.touches[0].clientX;
    _y0 = e.touches[0].clientY;
    _dx = 0;
    _swiping = false;
    cardInner.style.transition = 'none';
  }, { passive: true });

  row.addEventListener('touchmove', (e) => {
    _dx = e.touches[0].clientX - _x0;
    const _dy = e.touches[0].clientY - _y0;
    // Ignore vertical-dominant gestures
    if (Math.abs(_dy) > Math.abs(_dx)) return;
    if (_dx < 0) {
      _swiping = true;
      // Follow finger left, cap at 60px
      const offset = Math.max(_dx, -60);
      cardInner.style.transform = `translateX(${offset}px)`;
      e.preventDefault();
    }
  }, { passive: false });

  row.addEventListener('touchend', () => {
    // Always snap card back
    cardInner.style.transition = 'transform 0.22s ease';
    cardInner.style.transform = 'translateX(0)';

    if (!_swiping || _dx > -THRESHOLD) return;

    // Threshold passed — show modal after snap animation
    const name = isRehearsal(s) ? rhTitle(s) : s.artist;
    setTimeout(() => {
      showDeleteModal(name, isRehearsal(s), () => {
        const idx = shows.findIndex(x => x.id === s.id);
        if (idx > -1) {
          const calId = shows[idx].calEventId;
          shows.splice(idx, 1);
          rebuildDashboard();
          saveData();
          if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
          if (calId) deleteCalendarEventNative(calId);
        }
      });
    }, 180);
  });

  return row;
}

// ── GROUP BY MONTH ──
function groupByMonth(list) {
  const groups = {};
  list.forEach(s => {
    const key = `${s.year}-${String(s.month).padStart(2,'0')}`;
    if (!groups[key]) groups[key] = { label: MO[s.month] + ' ' + s.year, shows: [], total: 0 };
    groups[key].shows.push(s);
    if (!isRehearsal(s)) groups[key].total += s.pay;
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
    header.innerHTML = `<span class="month-group-label">${g.label}</span>${g.total > 0 ? `<span class="month-group-total financial-value">${formatAmount(g.total)}</span>` : ''}`;
    container.appendChild(header);
    g.shows.forEach(s => container.appendChild(makeShowRow(s)));
  });
}

// ── DASHBOARD ──
function rebuildDashboard() {
  const sorted = [...shows].sort((a,b) => new Date(a.year,a.month,a.day) - new Date(b.year,b.month,b.day));
  // Upcoming: gigs always shown, rehearsals conditionally
  const upcoming = sorted.filter(s => !isPast(s) && (isGig(s) || showRehearsals));
  const completed = sorted.filter(s => isPast(s) && (isGig(s) || showRehearsals)).reverse();
  const thisMonthShows = shows.filter(s => isThisMonth(s) && isGig(s));
  const projectedThisMonth = thisMonthShows.reduce((a,s) => a+s.pay, 0);
  const upcomingGigs = sorted.filter(s => !isPast(s) && isGig(s));
  const next = upcomingGigs[0];
  document.getElementById('s-count').textContent = upcomingGigs.length || '0';
  document.getElementById('s-earn').textContent = formatAmount(projectedThisMonth);
  document.getElementById('s-earn').className = 'stat-value';
  document.getElementById('s-month-label').textContent = MO[today.getMonth()] + ' ' + today.getFullYear();
  if (next) { document.getElementById('s-next').textContent = MS[next.month]+' '+next.day; document.getElementById('s-next-d').textContent = next.artist.split(' ')[0]+' · '+next.city; }
  else { document.getElementById('s-next').textContent = '—'; document.getElementById('s-next-d').textContent = 'No upcoming gigs'; }
  renderGroupedList(document.getElementById('list-upcoming'), upcoming, 'No upcoming gigs — tap Add Gig');
  renderGroupedList(document.getElementById('list-completed'), completed, 'No completed gigs yet');
  updateRehearsalToggleBtn();
}

// ── EARNINGS TOOLTIP ──
function showEarnTooltip(x, y, month, paid, pending) {
  const t = document.getElementById('earn-tooltip');
  t.innerHTML = `<div class="earn-tooltip-month">${month}</div><div class="earn-tooltip-row"><span class="earn-tooltip-label">Paid</span><span class="earn-tooltip-value purple">${formatAmount(paid)}</span></div><div class="earn-tooltip-row"><span class="earn-tooltip-label">Pending</span><span class="earn-tooltip-value amber">${formatAmount(pending)}</span></div>`;
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = x + 12 + 160 > vw ? x - 160 : x + 12;
  const top = y + 12 + 90 > vh ? y - 90 : y + 12;
  t.style.left = left + 'px';
  t.style.top = top + 'px';
  t.classList.add('visible');
}
function hideEarnTooltip() {
  document.getElementById('earn-tooltip')?.classList.remove('visible');
}

// ── EARNINGS ──
function rebuildEarnings() {
  const yr = today.getFullYear();
  const gigs = shows.filter(isGig);
  const yearGigs = gigs.filter(s => s.year === yr);

  const yearTotal = yearGigs.reduce((a, s) => a + s.pay, 0);
  const yearPaid = yearGigs.filter(s => s.payStatus === 'paid').reduce((a, s) => a + s.pay, 0);
  const yearPending = yearGigs.filter(s => s.payStatus === 'pending').reduce((a, s) => a + s.pay, 0);

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('e-stat-year-label', 'Total ' + yr);
  setEl('e-stat-total', formatAmount(yearTotal));
  setEl('e-stat-paid', formatAmount(yearPaid));
  setEl('e-stat-pending', formatAmount(yearPending));
  setEl('e-stat-count', yearGigs.length);

  // Monthly bar chart — paid vs pending, current year
  const monthlyPaid = Array(12).fill(0);
  const monthlyPending = Array(12).fill(0);
  yearGigs.forEach(s => {
    if (s.payStatus === 'paid') monthlyPaid[s.month] += s.pay;
    else monthlyPending[s.month] += s.pay;
  });
  const monthlyTotals = monthlyPaid.map((v, i) => v + monthlyPending[i]);
  const maxVal = Math.max(...monthlyTotals, 1);
  const BAR_MAX_H = 110;
  const MON = ['J','F','M','A','M','J','J','A','S','O','N','D'];

  // Ensure shared tooltip element exists
  if (!document.getElementById('earn-tooltip')) {
    const tooltip = document.createElement('div');
    tooltip.className = 'earn-tooltip';
    tooltip.id = 'earn-tooltip';
    document.body.appendChild(tooltip);
  }

  const barChart = document.getElementById('e-bar-chart');
  barChart.innerHTML = '';
  monthlyTotals.forEach((total, i) => {
    const paidH = Math.round((monthlyPaid[i] / maxVal) * BAR_MAX_H);
    const pendingH = Math.round((monthlyPending[i] / maxVal) * BAR_MAX_H);
    const group = document.createElement('div');
    group.className = 'earn-bar-group';
    group.innerHTML = `<div class="earn-bars"><div class="earn-bar paid" style="height:${paidH}px"></div><div class="earn-bar pending" style="height:${pendingH}px"></div></div><div class="earn-month-label">${MON[i]}</div>`;
    if (total > 0) {
      group.addEventListener('mousemove', (e) => {
        showEarnTooltip(e.clientX, e.clientY, MO[i], monthlyPaid[i], monthlyPending[i]);
      });
      group.addEventListener('mouseleave', hideEarnTooltip);
      group.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        showEarnTooltip(t.clientX, t.clientY, MO[i], monthlyPaid[i], monthlyPending[i]);
      }, { passive: false });
    }
    barChart.appendChild(group);
  });

  // By-type breakdown — current year
  const typeMap = {};
  yearGigs.forEach(s => { typeMap[s.type] = (typeMap[s.type] || 0) + s.pay; });
  const maxTypeAmt = Math.max(...Object.values(typeMap), 1);
  const typeList = document.getElementById('e-type-list');
  typeList.innerHTML = '';
  Object.entries(typeMap).sort((a, b) => b[1] - a[1]).forEach(([type, amt]) => {
    const pct = Math.round((amt / maxTypeAmt) * 100);
    const row = document.createElement('div');
    row.className = 'earn-type-row';
    row.innerHTML = `<div class="earn-type-name">${cap(type)}</div><div class="earn-type-bar-wrap"><div class="earn-type-bar" style="width:${pct}%"></div></div><div class="earn-type-amount financial-value">${formatAmount(amt)}</div>`;
    typeList.appendChild(row);
  });
}

// ── AUTOCOMPLETE ──
function setupAutocomplete(inputId, dropdownId, getOptions, onSelect, allowCreate, createLabel) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;
  function showDropdown(query) {
    const all = getOptions(); const q = query.trim().toLowerCase();
    const opts = q ? all.filter(o => o.toLowerCase().includes(q)) : all;
    dropdown.innerHTML = '';
    opts.slice(0,10).forEach(opt => {
      const item = document.createElement('div'); item.className = 'ac-item';
      if (q) { const idx = opt.toLowerCase().indexOf(q); item.innerHTML = opt.slice(0,idx)+'<strong>'+opt.slice(idx,idx+q.length)+'</strong>'+opt.slice(idx+q.length); }
      else { item.textContent = opt; }
      item.addEventListener('mousedown', e => { e.preventDefault(); onSelect(opt); input.value = opt; dropdown.style.display='none'; });
      dropdown.appendChild(item);
    });
    if (allowCreate && q && !all.find(o=>o.toLowerCase()===q)) {
      const addItem = document.createElement('div'); addItem.className = 'ac-item ac-add';
      addItem.innerHTML = `<i class="ti ti-plus" style="font-size:12px"></i> ${createLabel}: "<strong>${query}</strong>"`;
      addItem.addEventListener('mousedown', e => { e.preventDefault(); onSelect(query, true); input.value = query; dropdown.style.display='none'; });
      dropdown.appendChild(addItem);
    }
    dropdown.style.display = dropdown.children.length ? 'block' : 'none';
  }
  input.addEventListener('focus', () => showDropdown(input.value));
  input.addEventListener('input', () => showDropdown(input.value));
  input.addEventListener('blur', () => setTimeout(()=>dropdown.style.display='none', 180));
  input.addEventListener('click', () => { if(dropdown.style.display==='none') showDropdown(input.value); });
}

function initAutocompletes() {
  setupAutocomplete('fa','client-dropdown', getAllClients, ()=>{}, true, 'Add client');
  setupAutocomplete('fc','city-dropdown', getAllCities, (val,isNew)=>{ if(isNew){customCities.push(val);localStorage.setItem('mf_cities',JSON.stringify(customCities));} }, true, 'Add city');
  setupAutocomplete('rh-jampad','jampad-dropdown', getAllJampads, ()=>{}, true, 'Add jampad');
  setupAutocomplete('rh-artist','rh-artist-dropdown', getAllClients, ()=>{}, true, 'Add artist');
  // Linked gig autocomplete — shows upcoming gigs as options
  const linkedGigInput = document.getElementById('rh-linked-gig-input');
  const linkedGigDropdown = document.getElementById('linked-gig-dropdown');
  const linkedGigId = document.getElementById('rh-linked-gig-id');
  if (linkedGigInput && linkedGigDropdown) {
    function showLinkedGigDropdown(query) {
      const upcomingGigs = getUpcomingGigs();
      const q = query.trim().toLowerCase();
      const filtered = q ? upcomingGigs.filter(g => g.artist.toLowerCase().includes(q) || g.city.toLowerCase().includes(q)) : upcomingGigs;
      linkedGigDropdown.innerHTML = '';
      // Clear option
      const clearItem = document.createElement('div');
      clearItem.className = 'ac-item';
      clearItem.style.color = 'var(--color-text-secondary)';
      clearItem.textContent = '— No link (standalone rehearsal)';
      clearItem.addEventListener('mousedown', e => { e.preventDefault(); linkedGigInput.value=''; linkedGigId.value=''; linkedGigDropdown.style.display='none'; });
      linkedGigDropdown.appendChild(clearItem);
      filtered.slice(0,8).forEach(g => {
        const item = document.createElement('div');
        item.className = 'ac-item';
        item.innerHTML = `<strong>${g.artist}</strong> <span style="color:var(--color-text-secondary);font-size:12px">· ${g.city} · ${MS[g.month]} ${g.day}</span>`;
        item.addEventListener('mousedown', e => {
          e.preventDefault();
          linkedGigInput.value = `${g.artist} — ${MS[g.month]} ${g.day}`;
          linkedGigId.value = g.id;
          linkedGigDropdown.style.display = 'none';
          // Auto-fill artist from linked gig
          const artistField = document.getElementById('rh-artist');
          if (artistField && !artistField.value) artistField.value = g.artist;
        });
        linkedGigDropdown.appendChild(item);
      });
      linkedGigDropdown.style.display = linkedGigDropdown.children.length ? 'block' : 'none';
    }
    linkedGigInput.addEventListener('focus', () => showLinkedGigDropdown(linkedGigInput.value));
    linkedGigInput.addEventListener('input', () => showLinkedGigDropdown(linkedGigInput.value));
    linkedGigInput.addEventListener('blur', () => setTimeout(()=>linkedGigDropdown.style.display='none', 180));
    linkedGigInput.addEventListener('click', () => { if(linkedGigDropdown.style.display==='none') showLinkedGigDropdown(linkedGigInput.value); });
  }
}

// ── MORE DETAILS TOGGLE ──
function toggleMoreDetails() {
  moreDetailsOpen = !moreDetailsOpen;
  const body = document.getElementById('more-details-body');
  const icon = document.getElementById('more-details-icon');
  const label = document.getElementById('more-details-label');
  if (body) body.style.display = moreDetailsOpen ? 'block' : 'none';
  if (icon) icon.className = moreDetailsOpen ? 'ti ti-chevron-up' : 'ti ti-chevron-down';
  if (label) label.textContent = moreDetailsOpen ? 'Hide details' : 'More details';
}

// ── GIG TYPE PICKER ──
function getTypePickerOptions() {
  const usedTypes = shows.filter(isGig).map(s => s.type).filter(Boolean).map(cap);
  const all = [...new Set([...DEFAULT_GIG_TYPES, ...customGigTypes.map(cap), ...usedTypes])];
  return all.sort((a, b) => a.localeCompare(b));
}

function openTypePicker() {
  closeTypePicker();
  const currentVal = (document.getElementById('ft').value || '').toLowerCase();
  const options = getTypePickerOptions();

  const backdrop = document.createElement('div');
  backdrop.className = 'type-picker-backdrop';
  backdrop.id = 'type-picker-backdrop';
  backdrop.addEventListener('click', closeTypePicker);

  const sheet = document.createElement('div');
  sheet.className = 'type-picker-sheet';
  sheet.id = 'type-picker-sheet';
  sheet.addEventListener('click', e => e.stopPropagation());

  const title = document.createElement('div');
  title.className = 'type-picker-title';
  title.textContent = 'Gig Type';
  sheet.appendChild(title);

  options.forEach(opt => {
    const isSelected = opt.toLowerCase() === currentVal;
    const row = document.createElement('div');
    row.className = 'type-picker-row' + (isSelected ? ' selected' : '');
    row.innerHTML = `<span>${opt}</span>${isSelected ? '<i class="ti ti-check"></i>' : ''}`;
    row.addEventListener('click', () => { selectGigType(opt); closeTypePicker(); });
    sheet.appendChild(row);
  });

  const addRow = document.createElement('div');
  addRow.className = 'type-picker-row add-new';
  addRow.id = 'type-picker-add-row';
  addRow.innerHTML = '<i class="ti ti-plus" style="font-size:13px;margin-right:8px"></i><span>Add new type</span>';
  addRow.addEventListener('click', () => showAddTypeInput(addRow));
  sheet.appendChild(addRow);

  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
}

function closeTypePicker() {
  document.getElementById('type-picker-backdrop')?.remove();
  document.getElementById('type-picker-sheet')?.remove();
}

function selectGigType(typeStr) {
  document.getElementById('ft').value = typeStr.toLowerCase();
  const disp = document.getElementById('ft-display');
  if (disp) { disp.textContent = cap(typeStr); disp.style.color = 'rgba(255,255,255,0.88)'; }
}

function showAddTypeInput(addRow) {
  addRow.innerHTML = '';
  addRow.style.gap = '8px';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'New type name';
  inp.style.cssText = 'flex:1;background:transparent;border:none;outline:none;font-size:15px;color:#fff;font-family:inherit;min-width:0;';
  const btn = document.createElement('button');
  btn.textContent = 'Add';
  btn.style.cssText = 'background:none;border:none;color:#7F77DD;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;padding:0;flex-shrink:0;';
  function confirm() {
    const val = inp.value.trim();
    if (!val) return;
    const typeCapped = cap(val);
    if (!customGigTypes.some(t => t.toLowerCase() === val.toLowerCase())) {
      customGigTypes.push(typeCapped);
      localStorage.setItem('mf_gig_types', JSON.stringify(customGigTypes));
    }
    selectGigType(typeCapped);
    closeTypePicker();
  }
  btn.addEventListener('click', confirm);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
  addRow.appendChild(inp);
  addRow.appendChild(btn);
  setTimeout(() => inp.focus(), 50);
}

// ── GIG SHEET ──
function setSt(s) { selSt=s; document.getElementById('bc').className='sheet-chip'+(s==='confirmed'?' active-amber':''); document.getElementById('bt').className='sheet-chip'+(s==='tentative'?' active-amber':''); }
function setPaySt(s) { selPaySt=s; document.getElementById('bp-paid').className='sheet-chip'+(s==='paid'?' active-green':''); document.getElementById('bp-pending').className='sheet-chip'+(s==='pending'?' active-amber':''); }
function setSlot(s) { selSlot=s; document.getElementById('bs-morning').className='sheet-chip'+(s==='morning'?' active-amber':''); document.getElementById('bs-afternoon').className='sheet-chip'+(s==='afternoon'?' active-amber':''); document.getElementById('bs-evening').className='sheet-chip'+(s==='evening'?' active-amber':''); }

function openAdd(prefillDate) {
  closeFabMenu(); editingId=null;
  document.getElementById('sheet-title').textContent='Add a new gig';
  const rhSec = document.getElementById('gig-rehearsal-section');
  if (rhSec) rhSec.style.display = 'none';
  document.getElementById('fa').value=''; document.getElementById('fc').value='';
  document.getElementById('fv').value='';
  document.getElementById('ft').value='';
  const _ftDA=document.getElementById('ft-display'); if(_ftDA){_ftDA.textContent='Select type';_ftDA.style.color='rgba(255,255,255,0.5)';}
  document.getElementById('fp').value=''; document.getElementById('fn').value='';
  document.getElementById('fd').value=prefillDate||'';
  setSt('confirmed'); setPaySt('pending'); setSlot('');
  const _saveBtnA=document.getElementById('save-btn'); _saveBtnA.textContent='Save'; _saveBtnA.disabled=false; _saveBtnA.style.opacity=''; gigSaving=false;
  document.getElementById('delete-wrap').innerHTML='';
  document.getElementById('toast').classList.remove('show');
  moreDetailsOpen=false;
  document.getElementById('more-details-body').style.display='none';
  document.getElementById('more-details-icon').className='ti ti-chevron-down';
  const lbl=document.getElementById('more-details-label'); if(lbl)lbl.textContent='More details';
  document.getElementById('gig-overlay').classList.add('show');
}

function openEdit(showId) {
  const s=shows.find(x=>x.id===showId); if(!s) return;
  editingId=s.id;
  document.getElementById('sheet-title').textContent='Edit gig';
  document.getElementById('fa').value=s.artist;
  document.getElementById('ft').value=s.type;
  const _ftDE=document.getElementById('ft-display'); if(_ftDE){_ftDE.textContent=cap(s.type);_ftDE.style.color='rgba(255,255,255,0.88)';}

  document.getElementById('fd').value=`${s.year}-${String(s.month+1).padStart(2,'0')}-${String(s.day).padStart(2,'0')}`;
  document.getElementById('fc').value=s.city; document.getElementById('fv').value=s.venue||''; document.getElementById('fp').value=s.pay||''; document.getElementById('fn').value=s.notes||'';
  setSt(s.status); setPaySt(s.payStatus==='upcoming'?'pending':s.payStatus); setSlot(s.slot||'');
  const _saveBtnE=document.getElementById('save-btn'); _saveBtnE.textContent='Save'; _saveBtnE.disabled=false; _saveBtnE.style.opacity=''; gigSaving=false;
  document.getElementById('delete-wrap').innerHTML='<button class="del-btn" id="del-btn">🗑 Delete gig</button>';
  document.getElementById('del-btn').addEventListener('click', deleteShow);
  document.getElementById('toast').classList.remove('show');
  if(s.notes){moreDetailsOpen=true;document.getElementById('more-details-body').style.display='block';document.getElementById('more-details-icon').className='ti ti-chevron-up';const lbl2=document.getElementById('more-details-label');if(lbl2)lbl2.textContent='Hide details';}
  else{moreDetailsOpen=false;document.getElementById('more-details-body').style.display='none';document.getElementById('more-details-icon').className='ti ti-chevron-down';const lbl3=document.getElementById('more-details-label');if(lbl3)lbl3.textContent='More details';}
  // Rehearsal section
  renderGigRehearsalSection(s.id);
  document.getElementById('gig-overlay').classList.add('show');
}

function renderGigRehearsalSection(gigId) {
  const sec = document.getElementById('gig-rehearsal-section');
  const list = document.getElementById('gig-rehearsal-list');
  const btn = document.getElementById('add-rh-for-gig-btn');
  if (!sec) return;
  sec.style.display = 'block';
  list.innerHTML = '';
  const linked = getLinkedRehearsals(gigId);
  const gig = shows.find(s => s.id === gigId);
  const label = document.getElementById('rh-section-label');
  if (label) label.textContent = linked.length > 0 ? `${linked.length} rehearsal${linked.length>1?'s':''} linked` : 'Rehearsals';
  linked.forEach(r => {
    const item = document.createElement('div');
    item.className = 'rh-linked-item';
    item.innerHTML = `<i class="ti ti-calendar" aria-hidden="true"></i><span class="rh-linked-date">${MS[r.month]} ${r.day}</span><span class="rh-linked-venue">${rhTitle(r)}</span><i class="ti ti-chevron-right rh-linked-arrow" aria-hidden="true"></i>`;
    item.addEventListener('click', () => { closeSheet(); openEditRehearsal(r.id); });
    list.appendChild(item);
  });
  // Wire the add button
  if (btn) {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      closeSheet();
      openAddRehearsal(null, gigId);
    });
  }
}

function openEditFromPreview() { const id=previewShowId; closePreview(); openEdit(id); }
function closeSheet() {
  closeTypePicker();
  document.getElementById('gig-overlay').classList.remove('show');
  document.getElementById('rehearsal-overlay').classList.remove('show');
}

let gigSaving = false;
async function saveShow() {
  if(gigSaving) return;
  const saveBtn=document.getElementById('save-btn');
  gigSaving=true; saveBtn.disabled=true; saveBtn.style.opacity='0.4';
  const artist=document.getElementById('fa').value.trim();
  const type=document.getElementById('ft').value||'other';
  const date=document.getElementById('fd').value;
  const city=document.getElementById('fc').value.trim();
  const venue=document.getElementById('fv').value.trim();
  const pay=parseInt(document.getElementById('fp').value.replace(/,/g,''))||0;
  const notes=document.getElementById('fn').value.trim();
  const calSync=document.getElementById('cs').checked;
  if(!artist||!date){alert('Please enter at least a name and date.');gigSaving=false;saveBtn.disabled=false;saveBtn.style.opacity='';return;}
  const d=new Date(date+'T00:00:00'); const mo=d.getMonth(),dy=d.getDate(),yr=d.getFullYear();
  const isUpcoming=new Date(yr,mo,dy)>=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const computedPayStatus=isUpcoming&&selPaySt==='pending'?'upcoming':selPaySt;
  if(city&&!getAllCities().includes(city)){customCities.push(city);localStorage.setItem('mf_cities',JSON.stringify(customCities));}
  if(editingId){
    const idx=shows.findIndex(s=>s.id===editingId);
    const existingCalId=shows[idx].calEventId||null;
    const updated={id:editingId,eventType:'gig',year:yr,month:mo,day:dy,artist,type,city,venue,pay,status:selSt,payStatus:computedPayStatus,notes,slot:selSlot,calEventId:existingCalId};
    shows[idx]=updated; rebuildDashboard(); saveData();
    if(calSync&&existingCalId) updateCalendarEventNative(updated);
    else if(calSync&&!existingCalId){const eid=await createCalendarEventNative(updated);if(eid){shows[idx].calEventId=eid;saveData();}}
  } else {
    const newGig={id:nextId++,eventType:'gig',year:yr,month:mo,day:dy,artist,type,city,venue,pay,status:selSt,payStatus:computedPayStatus,notes,slot:selSlot,calEventId:null};
    shows.push(newGig); rebuildDashboard(); saveData();
    if(calSync){const eid=await createCalendarEventNative(newGig);if(eid){const idx=shows.findIndex(s=>s.id===newGig.id);if(idx>-1){shows[idx].calEventId=eid;saveData();}}}
  }
  closeSheet();
  if(document.getElementById('panel-calendar').classList.contains('active')) renderCal();
}

async function deleteShow() {
  if(!editingId||!confirm('Delete this gig?')) return;
  const idx=shows.findIndex(s=>s.id===editingId);
  if(idx>-1){const calId=shows[idx].calEventId;shows.splice(idx,1);rebuildDashboard();saveData();closeSheet();if(document.getElementById('panel-calendar').classList.contains('active'))renderCal();if(calId)deleteCalendarEventNative(calId);}
}

// ── REHEARSAL SHEET ──
function openAddRehearsal(prefillDate, prefillGigId) {
  closeFabMenu(); editingId=null;
  document.getElementById('rh-sheet-title').textContent='Add rehearsal';
  document.getElementById('rh-date').value=prefillDate||'';
  document.getElementById('rh-time-hour').value='';
  document.getElementById('rh-time-min').value='00';
  document.getElementById('rh-jampad').value='';
  document.getElementById('rh-notes').value='';
  document.getElementById('rh-cs').checked=true;
  const _rhSaveBtn=document.getElementById('rh-save-btn');
  _rhSaveBtn.textContent='Save'; _rhSaveBtn.disabled=false; _rhSaveBtn.style.opacity='';
  rhSaving=false;
  document.getElementById('rh-delete-wrap').innerHTML='';
  // Pre-link to gig if coming from gig sheet
  const linkedInput = document.getElementById('rh-linked-gig-input');
  const linkedId = document.getElementById('rh-linked-gig-id');
  const artistInput = document.getElementById('rh-artist');
  if (prefillGigId) {
    const gig = shows.find(s => s.id === prefillGigId);
    if (gig && linkedInput && linkedId) {
      linkedInput.value = `${gig.artist} — ${MS[gig.month]} ${gig.day}`;
      linkedId.value = prefillGigId;
      if (artistInput) artistInput.value = gig.artist;
    }
  } else {
    if (linkedInput) linkedInput.value = '';
    if (linkedId) linkedId.value = '';
    if (artistInput) artistInput.value = '';
  }
  setTimeout(() => { document.getElementById('rehearsal-overlay').classList.add('show'); }, 0);
}

function openEditRehearsal(showId) {
  const s=shows.find(x=>x.id===showId); if(!s) return;
  editingId=s.id;
  document.getElementById('rh-sheet-title').textContent='Edit rehearsal';
  document.getElementById('rh-date').value=`${s.year}-${String(s.month+1).padStart(2,'0')}-${String(s.day).padStart(2,'0')}`;
  document.getElementById('rh-jampad').value=s.jampad||'';
  document.getElementById('rh-notes').value=s.notes||'';
  const _rhHour=document.getElementById('rh-time-hour');
  const _rhMin=document.getElementById('rh-time-min');
  if(_rhHour&&_rhMin){
    const t=s.time||'';
    if(t&&t.includes(':')){const parts=t.split(':');_rhHour.value=parseInt(parts[0]);_rhMin.value=parseInt(parts[1])>=15?'30':'00';}
    else{_rhHour.value='';_rhMin.value='00';}
  }
  document.getElementById('rh-cs').checked=true;
  const _rhSaveBtn2=document.getElementById('rh-save-btn');
  _rhSaveBtn2.textContent='Save'; _rhSaveBtn2.disabled=false; _rhSaveBtn2.style.opacity='';
  rhSaving=false;
  document.getElementById('rh-delete-wrap').innerHTML='<button class="del-btn" id="rh-del-btn">🗑 Delete rehearsal</button>';
  document.getElementById('rh-del-btn').addEventListener('click', deleteRehearsal);
  // Populate linked gig and artist
  const linkedInput = document.getElementById('rh-linked-gig-input');
  const linkedId = document.getElementById('rh-linked-gig-id');
  const artistInput = document.getElementById('rh-artist');
  if (s.linkedGigId) {
    const gig = shows.find(g => g.id === s.linkedGigId);
    if (gig && linkedInput && linkedId) {
      linkedInput.value = `${gig.artist} — ${MS[gig.month]} ${gig.day}`;
      linkedId.value = s.linkedGigId;
      if (artistInput) artistInput.value = s.artist || gig.artist;
    }
  } else {
    if (linkedInput) linkedInput.value = '';
    if (linkedId) linkedId.value = '';
    if (artistInput) artistInput.value = s.artist || '';
  }
  document.getElementById('rehearsal-overlay').classList.add('show');
}

let rhSaving = false;
async function saveRehearsal() {
  if (rhSaving) return;
  const saveBtn = document.getElementById('rh-save-btn');
  rhSaving = true;
  saveBtn.disabled = true;
  saveBtn.style.opacity = '0.4';
  const date=document.getElementById('rh-date').value;
  const jampad=document.getElementById('rh-jampad').value.trim()||'Rehearsal';
  const notes=document.getElementById('rh-notes').value.trim();
  const calSync=document.getElementById('rh-cs').checked;
  const rhHourVal=document.getElementById('rh-time-hour')?.value;
  const rhMinVal=document.getElementById('rh-time-min')?.value||'00';
  const time=rhHourVal?`${String(rhHourVal).padStart(2,'0')}:${rhMinVal}`:'';
  const artist=document.getElementById('rh-artist')?.value.trim()||'';
  const linkedGigIdRaw = document.getElementById('rh-linked-gig-id')?.value;
  const linkedGigId = linkedGigIdRaw ? parseInt(linkedGigIdRaw) : null;
  if(!date){
    alert('Please enter a date.');
    rhSaving = false; saveBtn.disabled = false; saveBtn.style.opacity = '';
    return;
  }
  const d=new Date(date+'T00:00:00'); const mo=d.getMonth(),dy=d.getDate(),yr=d.getFullYear();
  if(editingId){
    const idx=shows.findIndex(s=>s.id===editingId);
    const existingCalId=shows[idx].calEventId||null;
    const updated={id:editingId,eventType:'rehearsal',year:yr,month:mo,day:dy,jampad,artist,time,notes,linkedGigId,calEventId:existingCalId};
    shows[idx]=updated; rebuildDashboard(); saveData();
    if(calSync&&existingCalId) updateRehearsalCalEvent(updated);
    else if(calSync&&!existingCalId){const eid=await createRehearsalCalEvent(updated);if(eid){shows[idx].calEventId=eid;saveData();}}
  } else {
    const newR={id:nextId++,eventType:'rehearsal',year:yr,month:mo,day:dy,jampad,artist,time,notes,linkedGigId,calEventId:null};
    shows.push(newR); rebuildDashboard(); saveData();
    if(calSync){
      const rhIdx=shows.findIndex(s=>s.id===newR.id);
      if(rhIdx>-1){
        if(shows[rhIdx].calEventId){updateRehearsalCalEvent(shows[rhIdx]);}
        else{const eid=await createRehearsalCalEvent(newR);if(eid){shows[rhIdx].calEventId=eid;saveData();}}
      }
    }
  }
  closeSheet();
  if(document.getElementById('panel-calendar').classList.contains('active')) renderCal();
}

function rhCalTimes(r, dateStr) {
  if(r.time&&r.time.includes(':')){
    const [h,m]=r.time.split(':').map(Number);
    const pad=n=>String(n).padStart(2,'0');
    return {start:{dateTime:`${dateStr}T${pad(h)}:${pad(m)}:00`,timeZone:'Asia/Kolkata'},end:{dateTime:`${dateStr}T${pad((h+1)%24)}:${pad(m)}:00`,timeZone:'Asia/Kolkata'}};
  }
  return {start:{date:dateStr},end:{date:dateStr}};
}

async function createRehearsalCalEvent(r) {
  const token=getToken(); if(!token) return null;
  const dateStr=`${r.year}-${String(r.month+1).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
  const {start,end}=rhCalTimes(r,dateStr);
  const timeNote=r.time?`\nTime: ${r.time}`:'';
  try {
    const res=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({summary:`🥁 ${rhTitle(r)}`,description:`Jampad: ${r.jampad||'—'}${timeNote}${r.notes?'\nNotes: '+r.notes:''}\n\nManaged by Musician's Friend`,start,end,colorId:'5'})});
    const data=await res.json(); return data.id||null;
  } catch(e){return null;}
}

async function updateRehearsalCalEvent(r) {
  const token=getToken(); if(!token||!r.calEventId) return;
  const dateStr=`${r.year}-${String(r.month+1).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
  const {start,end}=rhCalTimes(r,dateStr);
  const timeNote=r.time?`\nTime: ${r.time}`:'';
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${r.calEventId}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({summary:`🥁 ${rhTitle(r)}`,description:`Jampad: ${r.jampad||'—'}${timeNote}${r.notes?'\nNotes: '+r.notes:''}\n\nManaged by Musician's Friend`,start,end,colorId:'5'})});
  } catch(e){}
}

async function deleteRehearsal() {
  if(!editingId||!confirm('Delete this rehearsal?')) return;
  const idx=shows.findIndex(s=>s.id===editingId);
  if(idx>-1){const calId=shows[idx].calEventId;shows.splice(idx,1);rebuildDashboard();saveData();closeSheet();if(document.getElementById('panel-calendar').classList.contains('active'))renderCal();if(calId)deleteCalendarEventNative(calId);}
}

function showToast(msg) {
  const t=document.getElementById('toast'); if(!t) return;
  t.textContent='✓ '+msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1400);
}

// ── CALENDAR ──
function showPreview(showId,dayEl) {
  const s=shows.find(x=>x.id===showId); if(!s) return;
  if(previewShowId===showId){closePreview();return;}
  previewShowId=showId;
  if(isRehearsal(s)){
    document.getElementById('pv-artist').textContent=s.artist||'Rehearsal';
    const b=document.getElementById('pv-badge');b.textContent='🥁 Rehearsal';b.className='badge rehearsal-badge';
    document.getElementById('pv-city').textContent=s.jampad||'';
    document.getElementById('pv-date').textContent=`${s.day} ${MS[s.month]} ${s.year}`;
    const pe=document.getElementById('pv-pay');pe.textContent=s.notes||'';pe.className='pv-pay dim';
  } else {
    document.getElementById('pv-artist').textContent=s.artist;
    const b=document.getElementById('pv-badge');b.textContent=cap(s.type);b.className='badge '+(BC[s.type]||'other');
    document.getElementById('pv-city').textContent=s.city;
    document.getElementById('pv-date').textContent=`${s.day} ${MS[s.month]} ${s.year}`;
    const pe=document.getElementById('pv-pay');pe.textContent=formatAmount(s.pay)+(s.status==='tentative'?' (tentative)':'');pe.className='pv-pay'+(s.status==='tentative'?' dim':'');
  }
  const card=document.getElementById('preview');
  const pr=document.getElementById('panel-calendar').getBoundingClientRect();
  const dr=dayEl.getBoundingClientRect();const cp=document.getElementById('panel-calendar');
  let top=dr.bottom-pr.top+cp.scrollTop+4;let left=dr.left-pr.left;
  if(left+240>pr.width)left=pr.width-244;if(left<4)left=4;
  if(top+200>pr.height)top=dr.top-pr.top+cp.scrollTop-210;
  card.style.top=top+'px';card.style.left=left+'px';card.classList.add('show');
  document.querySelectorAll('.cday.selected').forEach(d=>d.classList.remove('selected'));
  dayEl.classList.add('selected');
}
function closePreview(){previewShowId=null;const p=document.getElementById('preview');if(p)p.classList.remove('show');document.querySelectorAll('.cday.selected').forEach(d=>d.classList.remove('selected'));}

function renderCal() {
  closePreview();
  document.getElementById('cal-title').textContent=MO[calM]+' '+calY;
  const g=document.getElementById('cal-grid');g.innerHTML='';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d=>{const e=document.createElement('div');e.className='dow';e.textContent=d;g.appendChild(e);});
  const first=new Date(calY,calM,1).getDay();const dim=new Date(calY,calM+1,0).getDate();const dip=new Date(calY,calM,0).getDate();
  const ms=shows.filter(s=>s.year===calY&&s.month===calM);const sd={};
  ms.forEach(s=>{if(!sd[s.day])sd[s.day]=[];sd[s.day].push(s);});
  for(let i=0;i<first;i++){const e=document.createElement('div');e.className='cday other';e.innerHTML=`<div class="dnum">${dip-first+1+i}</div>`;g.appendChild(e);}
  for(let d=1;d<=dim;d++){
    const e=document.createElement('div');e.className='cday';
    if(today.getFullYear()===calY&&today.getMonth()===calM&&today.getDate()===d)e.classList.add('today');
    e.innerHTML=`<div class="dnum">${d}</div>`;
    if(sd[d]){
      e.classList.add('hasshow');
      const dr=document.createElement('div');dr.className='dots-row';
      sd[d].forEach(s=>{
        const dot=document.createElement('div');
        if(isRehearsal(s)) dot.className='sdot rehearsal-dot';
        else dot.className='sdot'+(s.status==='tentative'?' t':'');
        dr.appendChild(dot);
      });
      e.appendChild(dr);
      const sid=sd[d][0].id;
      e.addEventListener('click',ev=>{ev.stopPropagation();showPreview(sid,e);});
    } else {
      e.addEventListener('click',ev=>{ev.stopPropagation();const dd=`${calY}-${String(calM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;openAdd(dd);});
    }
    g.appendChild(e);
  }
  const rem=(7-(first+dim)%7)%7;for(let i=1;i<=rem;i++){const e=document.createElement('div');e.className='cday other';e.innerHTML=`<div class="dnum">${i}</div>`;g.appendChild(e);}
  const gigMs=ms.filter(isGig);const conf=gigMs.filter(s=>s.status==='confirmed').length;const earn=gigMs.reduce((a,s)=>a+s.pay,0);
  document.getElementById('cc').textContent=ms.length||'—';document.getElementById('ccf').textContent=conf||'—';
  const ceEl = document.getElementById('ce');
  if (ceEl) { ceEl.textContent = gigMs.length ? formatAmount(earn) : '—'; }
  // Update calendar legend to show rehearsal dot if any rehearsals this month
  const hasRehearsal = ms.some(isRehearsal);
  const calLeg = document.querySelector('.cal-leg');
  if (calLeg) {
    const existingRhLeg = calLeg.querySelector('.rh-leg');
    if (hasRehearsal && !existingRhLeg) {
      const rhLi = document.createElement('div');
      rhLi.className = 'li rh-leg';
      rhLi.innerHTML = '<div class="ld" style="background:var(--rehearsal,#B5860D)"></div> Rehearsal';
      calLeg.appendChild(rhLi);
    } else if (!hasRehearsal && existingRhLeg) {
      existingRhLeg.remove();
    }
  }
  const ag=document.getElementById('agenda');ag.innerHTML='';
  if(ms.length){
    const h = document.createElement('div');
    h.className = 'sec-label';
    h.style.marginTop = '14px';
    h.textContent = 'This month';
    ag.appendChild(h);

    const allItems = [...ms].sort((a,b) => a.day - b.day);
    const PREVIEW_COUNT = 3;

    allItems.forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'agenda-item';
      if (idx >= PREVIEW_COUNT) row.classList.add('agenda-hidden');
      if (isRehearsal(s)) {
        row.innerHTML = `<span class="ag-date">${MS[s.month]} ${s.day}</span><span class="ag-artist">${rhTitle(s)}</span><span class="badge rehearsal-badge" style="font-size:10px">🥁 Rehearsal</span><span class="ag-pay" style="visibility:hidden">—</span>`;
        row.addEventListener('click', () => openEditRehearsal(s.id));
      } else {
        row.innerHTML = `<span class="ag-date">${MS[s.month]} ${s.day}</span><span class="ag-artist">${s.artist}</span><span class="badge ${BC[s.type]||'other'}" style="font-size:10px">${cap(s.type)}</span><span class="ag-pay financial-value">${formatAmount(s.pay)}</span>`;
        row.addEventListener('click', () => openEdit(s.id));
      }
      ag.appendChild(row);
    });

    if (allItems.length > PREVIEW_COUNT) {
      const remaining = allItems.length - PREVIEW_COUNT;
      const showMoreBtn = document.createElement('button');
      showMoreBtn.className = 'agenda-show-more';
      showMoreBtn.innerHTML = `<i class="ti ti-chevron-down"></i> Show ${remaining} more`;
      showMoreBtn.addEventListener('click', () => {
        ag.querySelectorAll('.agenda-hidden').forEach(r => r.classList.remove('agenda-hidden'));
        showMoreBtn.remove();
      });
      ag.appendChild(showMoreBtn);
    }
  }
}

// ── CHAT ──
async function sendMsg() {
  const inp=document.getElementById('cin');const text=inp.value.trim();if(!text)return;
  inp.value='';inp.style.height='auto';
  const msgs=document.getElementById('chat-msgs');
  const u=document.createElement('div');u.className='msg user';
  u.innerHTML=`<div class="av"><i class="ti ti-user"></i></div><div class="bub">${text}</div>`;
  msgs.appendChild(u);msgs.scrollTop=msgs.scrollHeight;
  document.getElementById('tdots').classList.add('show');
  try {
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:`You are Musician's Friend, a warm personal assistant for a musician in India. Be concise and friendly. Use ₹. Events: ${JSON.stringify(shows)}.`,messages:[{role:'user',content:text}]})});
    const data=await res.json();const reply=data.content?.[0]?.text||"Could you rephrase that?";
    document.getElementById('tdots').classList.remove('show');
    const b=document.createElement('div');b.className='msg bot';
    b.innerHTML=`<div class="av"><i class="ti ti-music"></i></div><div class="bub">${reply}</div>`;
    msgs.appendChild(b);msgs.scrollTop=msgs.scrollHeight;
  } catch(e) {
    document.getElementById('tdots').classList.remove('show');
    const b=document.createElement('div');b.className='msg bot';
    b.innerHTML=`<div class="av"><i class="ti ti-music"></i></div><div class="bub">Sorry, had a hiccup! Try again.</div>`;msgs.appendChild(b);
  }
}

// ── DELETE MODAL ──
let deleteModalCallback = null;

function showDeleteModal(name, isRehearsalItem, cb) {
  deleteModalCallback = cb;
  const title = document.getElementById('delete-modal-title');
  const sub = document.getElementById('delete-modal-sub');
  if (title) title.textContent = `Delete ${isRehearsalItem ? 'rehearsal' : 'gig'}?`;
  if (sub) sub.textContent = `"${name}" will be permanently removed.`;
  const backdrop = document.getElementById('delete-modal-backdrop');
  if (backdrop) backdrop.classList.add('show');
}

function closeDeleteModal() {
  const backdrop = document.getElementById('delete-modal-backdrop');
  if (backdrop) backdrop.classList.remove('show');
  deleteModalCallback = null;
}

// ── SNAP BACK HELPER ──
function snapBack(row) {
  const inner=row.querySelector?row.querySelector('.swipe-card-inner'):row;
  const target=inner||row;
  target.style.transition='transform 0.2s ease';target.style.transform='translateX(0)';
  row.dataset.swiped='false';
}

// ── EVENT LISTENERS ──
function setupEventListeners() {
  initAutocompletes();

  // FAB → action sheet
  document.getElementById('privacy-btn')?.addEventListener('click', togglePrivacy);
  document.getElementById('fab').addEventListener('click', (e) => { e.stopPropagation(); openFabMenu(); });
  document.getElementById('fab-add-gig').addEventListener('click', () => openAdd());
  document.getElementById('fab-add-rehearsal').addEventListener('click', (e) => { e.stopPropagation(); openAddRehearsal(); });
  document.addEventListener('click', (e) => { if(!e.target.closest('#fab')&&!e.target.closest('#fab-menu')) closeFabMenu(); });
  document.getElementById('fab-backdrop')?.addEventListener('click', closeFabMenu);

  // Gig sheet
  const fpInput = document.getElementById('fp');
  if (fpInput) {
    fpInput.addEventListener('blur', function() {
      const raw = parseInt(this.value.replace(/,/g, '')) || 0;
      if (raw > 0) this.value = raw.toLocaleString('en-IN');
    });
    fpInput.addEventListener('focus', function() {
      this.value = this.value.replace(/,/g, '');
    });
    fpInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.blur();
      }
    });
  }
  document.getElementById('bc').addEventListener('click',()=>setSt('confirmed'));
  document.getElementById('bt').addEventListener('click',()=>setSt('tentative'));
  document.getElementById('bp-paid').addEventListener('click',()=>setPaySt('paid'));
  document.getElementById('bp-pending').addEventListener('click',()=>setPaySt('pending'));
  document.getElementById('bs-morning').addEventListener('click',()=>setSlot(selSlot==='morning'?'':'morning'));
  document.getElementById('bs-afternoon').addEventListener('click',()=>setSlot(selSlot==='afternoon'?'':'afternoon'));
  document.getElementById('bs-evening').addEventListener('click',()=>setSlot(selSlot==='evening'?'':'evening'));
  document.getElementById('save-btn').addEventListener('click',saveShow);
  document.getElementById('gig-overlay').addEventListener('click',e=>{if(e.target===document.getElementById('gig-overlay'))closeSheet();});

  // Rehearsal sheet
  document.getElementById('rh-save-btn').addEventListener('click',saveRehearsal);
  document.getElementById('rehearsal-overlay').addEventListener('click',e=>{if(e.target===document.getElementById('rehearsal-overlay'))closeSheet();});
  document.getElementById('rh-close-btn').addEventListener('click',closeSheet);

  // Shared
  document.getElementById('cal-prev').addEventListener('click',e=>{e.stopPropagation();calM--;if(calM<0){calM=11;calY--;}renderCal();});
  document.getElementById('cal-next').addEventListener('click',e=>{e.stopPropagation();calM++;if(calM>11){calM=0;calY++;}renderCal();});
  document.getElementById('panel-calendar').addEventListener('click',e=>{if(!e.target.closest('.preview-card')&&!e.target.closest('.cday'))closePreview();});
  document.getElementById('pv-close').addEventListener('click',closePreview);
  document.getElementById('pv-edit').addEventListener('click',openEditFromPreview);
  document.getElementById('confirm-yes').addEventListener('click',()=>{if(confirmCallback)confirmCallback();closeConfirm();});
  document.getElementById('confirm-no').addEventListener('click',closeConfirm);
  document.addEventListener('click',e=>{if(!e.target.closest('.confirm-popup')&&!e.target.closest('.pay-marker'))closeConfirm();});
  document.getElementById('send-btn').addEventListener('click',sendMsg);
  document.getElementById('cin').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();}});
  document.getElementById('cin').addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,80)+'px';});
  const moreBtn=document.getElementById('more-details-btn');
  if(moreBtn) moreBtn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleMoreDetails();});
  const closeBtn=document.getElementById('sheet-close-btn');
  if(closeBtn) closeBtn.addEventListener('click',e=>{e.preventDefault();closeSheet();});
  document.getElementById('rehearsal-toggle-btn').addEventListener('click', toggleRehearsalVisibility);
  document.getElementById('delete-modal-confirm').addEventListener('click', () => {
    if (deleteModalCallback) deleteModalCallback();
    closeDeleteModal();
  });
  document.getElementById('delete-modal-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === document.getElementById('delete-modal-backdrop')) closeDeleteModal();
  });
  // Auto-refresh
  let lastFetchTime = Date.now();
  const MIN_REFETCH_INTERVAL = 30000;
  async function refreshIfStale() {
    if(document.getElementById('gig-overlay').classList.contains('show')) return;
    if(document.getElementById('rehearsal-overlay').classList.contains('show')) return;
    if(Date.now()-lastFetchTime<MIN_REFETCH_INTERVAL) return;
    if(typeof getToken==='function' && !getToken()){setSyncStatus('saved','Ready');return;}
    lastFetchTime=Date.now();
    try {
      setSyncStatus('saving','Syncing...');
      const data=await loadFromDrive();
      if(data&&data.shows){shows=data.shows;nextId=shows.length>0?Math.max(...shows.map(s=>s.id))+1:1;rebuildDashboard();if(document.getElementById('panel-calendar').classList.contains('active'))renderCal();if(document.getElementById('panel-earnings').classList.contains('active'))rebuildEarnings();setSyncStatus('saved','Synced ✓');}
      else{setSyncStatus('saved','Ready');}
    } catch(e){setSyncStatus('error','Sync failed');}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshIfStale();});
  window.addEventListener('focus',()=>refreshIfStale());

  // Dismiss earnings chart tooltip on tap outside a bar group
  document.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.earn-bar-group')) hideEarnTooltip();
  }, { passive: true });

  // Escape key closes any open sheet, modal, or overlay
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('delete-modal-backdrop').classList.contains('show')) { closeDeleteModal(); return; }
    if (document.getElementById('gig-overlay').classList.contains('show')) { closeSheet(); return; }
    if (document.getElementById('rehearsal-overlay').classList.contains('show')) { closeSheet(); return; }
    if (document.getElementById('confirm-popup').classList.contains('show')) { closeConfirm(); return; }
    if (document.getElementById('preview').classList.contains('show')) { closePreview(); return; }
    if (document.getElementById('fab-menu').classList.contains('show')) { closeFabMenu(); return; }
  });
}

// ── v4.5.0 — THEME SYSTEM ──────────────────────────────────────────────────

function applyTheme(theme) {
  const html = document.documentElement;
  html.classList.remove('theme-auto', 'theme-light', 'theme-dark');
  html.classList.add('theme-' + theme);
  localStorage.setItem('mf-theme', theme);
  document.querySelectorAll('.theme-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.theme === theme);
  });
}

function initTheme() {
  const saved = localStorage.getItem('mf-theme') || 'auto';
  applyTheme(saved);
}

// ── HOME HEADER ────────────────────────────────────────────────────────────

function updateHomeHeader() {
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const emailEl = document.getElementById('user-email');
  let firstName = '';
  const storedName = localStorage.getItem('mf_name');
  if (storedName) {
    firstName = storedName.split(' ')[0];
    firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  } else if (emailEl) {
    const raw = emailEl.textContent || '';
    if (raw && raw !== 'Your personal music manager') {
      firstName = raw.split('@')[0].replace(/[._]/g, ' ').split(' ')[0];
      firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    }
  }
  const greetEl = document.getElementById('mf-greeting');
  if (greetEl) greetEl.textContent = firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
  const dateEl = document.getElementById('mf-header-date');
  if (dateEl) {
    const now = new Date();
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    dateEl.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;
  }
  const initial = firstName ? firstName.charAt(0).toUpperCase() : 'M';
  const hdrAvatar = document.getElementById('hdr-avatar');
  if (hdrAvatar) hdrAvatar.textContent = initial;
  const settingsAvatar = document.getElementById('settings-avatar');
  if (settingsAvatar) settingsAvatar.textContent = initial;
  const settingsName = document.getElementById('settings-name');
  if (settingsName && firstName) settingsName.textContent = firstName;
  const settingsEmail = document.getElementById('settings-email-display');
  if (settingsEmail && emailEl && emailEl.textContent && emailEl.textContent !== 'Your personal music manager') {
    settingsEmail.textContent = emailEl.textContent;
  }
}

// ── HERO CARD ──────────────────────────────────────────────────────────────

const _origRebuildDashboard = rebuildDashboard;
rebuildDashboard = function() {
  _origRebuildDashboard.apply(this, arguments);
  const sorted = [...shows].sort((a,b) => new Date(a.year,a.month,a.day)-new Date(b.year,b.month,b.day));
  const next = sorted.filter(s => !isPast(s) && isGig(s))[0];
  const heroVenue = document.getElementById('hero-venue');
  const heroType  = document.getElementById('hero-type');
  const heroPay   = document.getElementById('hero-pay');
  const heroTime  = document.getElementById('hero-time-display');
  if (heroVenue) heroVenue.textContent = next ? (next.artist || '—') : 'No upcoming gigs';
  if (heroType)  heroType.textContent  = next ? cap(next.type || 'gig') : '—';
  if (heroPay)   heroPay.textContent   = next ? formatAmount(next.pay) : '—';
  if (heroTime)  heroTime.textContent  = next ? (next.slot ? cap(next.slot) : 'TBA') : 'TBA';
};

// ── EARNINGS: MARK CURRENT MONTH BAR ──────────────────────────────────────

const _origRebuildEarnings = rebuildEarnings;
rebuildEarnings = function() {
  _origRebuildEarnings.apply(this, arguments);
  const groups = document.querySelectorAll('.earn-bar-group');
  if (groups[today.getMonth()]) groups[today.getMonth()].classList.add('earn-bar-current');
};

// ── PATCH applyPrivacyMode FOR NEW UI ELEMENTS ─────────────────────────────

const _origApplyPrivacyMode = applyPrivacyMode;
applyPrivacyMode = function() {
  _origApplyPrivacyMode.apply(this, arguments);
  const earnIcon = document.getElementById('earn-privacy-icon');
  if (earnIcon) earnIcon.className = privacyMode ? 'ti ti-eye-off' : 'ti ti-eye';
  const privVal = document.getElementById('settings-privacy-value');
  if (privVal) privVal.textContent = privacyMode ? 'On' : 'Off';
};

// ── PATCH switchTab: settings tab + earnings FAB ───────────────────────────

const _origSwitchTab = switchTab;
switchTab = function(tab, el) {
  _origSwitchTab.apply(this, arguments);
  const fab = document.getElementById('fab');
  if (fab && tab === 'earnings') fab.style.display = 'flex';
  if (fab && tab === 'settings') fab.style.display = 'none';
  if (tab === 'settings') updateSettingsView();
};

function updateSettingsView() {
  updateHomeHeader();
  const privVal = document.getElementById('settings-privacy-value');
  if (privVal) privVal.textContent = privacyMode ? 'On' : 'Off';
}

// ── SETTINGS INIT ──────────────────────────────────────────────────────────

function initSettingsListeners() {
  document.querySelectorAll('.theme-pill').forEach(pill => {
    pill.addEventListener('click', () => applyTheme(pill.dataset.theme));
  });
  const refreshRow = document.getElementById('settings-refresh-row');
  if (refreshRow) {
    refreshRow.addEventListener('click', async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
        const keys = await caches.keys();
        for (const k of keys) await caches.delete(k);
      }
      window.location.reload(true);
    });
  }
  const privacyRow = document.getElementById('settings-privacy-row');
  if (privacyRow) privacyRow.addEventListener('click', togglePrivacy);
  const signoutBtn = document.getElementById('settings-signout-btn');
  if (signoutBtn) signoutBtn.addEventListener('click', () => {
    const orig = document.getElementById('signout-btn');
    if (orig) orig.click();
  });
  const hdrAvatar = document.getElementById('hdr-avatar');
  if (hdrAvatar) hdrAvatar.addEventListener('click', () => {
    const settingsTab = document.querySelector('.nav-tab:last-child');
    if (settingsTab) settingsTab.click();
  });
}

// ── BOOT ───────────────────────────────────────────────────────────────────

initTheme();
document.addEventListener('DOMContentLoaded', () => {
  updateHomeHeader();
  initSettingsListeners();
});
// Also run after auth sets user-email (auth.js calls initApp which we hook here)
const _origInitApp = typeof initApp === 'function' ? initApp : null;
if (_origInitApp) {
  initApp = async function() {
    await _origInitApp.apply(this, arguments);
    updateHomeHeader();
    applyPrivacyMode();
  };
}
