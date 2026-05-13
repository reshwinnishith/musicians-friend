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
let moreDetailsOpen = false;

const MO = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BC = {wedding:'wedding',pub:'pub',corporate:'corporate',college:'college',festival:'festival',other:'other'};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
const isPast = s => new Date(s.year, s.month, s.day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
const isThisMonth = s => s.year === today.getFullYear() && s.month === today.getMonth();

// ── DEFAULT LISTS ──
const DEFAULT_GIG_TYPES = ['Wedding','Pub','Corporate','College','Festival','Other'];
let customGigTypes = JSON.parse(localStorage.getItem('mf_gig_types') || '[]');
let customCities = JSON.parse(localStorage.getItem('mf_cities') || '[]');

function getAllGigTypes() {
  return [...new Set([...DEFAULT_GIG_TYPES, ...customGigTypes])];
}
function getAllClients() {
  return [...new Set(shows.map(s => s.artist).filter(Boolean))];
}
function getAllCities() {
  const fromShows = shows.map(s => s.city).filter(Boolean);
  return [...new Set([...fromShows, ...customCities])];
}

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
      setSyncStatus('saved', 'Synced ✓');
    } else { shows = []; setSyncStatus('saved', 'Ready'); }
  } catch(e) { shows = []; setSyncStatus('error', 'Load failed'); }
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

// ── TAB / FAB VISIBILITY ──
function switchTab(tab, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  el.classList.add('active');
  closePreview(); closeConfirm();
  // FAB only on dashboard + calendar
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
// Confirmed = green, Tentative = yellow, Pending = orange/red, Completed/Paid = blue-grey
function pillClass(s) {
  if (s.payStatus === 'paid') return 'pill-paid';
  if (isPast(s)) return 'pill-pending';
  if (s.status === 'tentative') return 'pill-tentative';
  return 'pill-upcoming';
}
function pillLabel(s) {
  if (s.payStatus === 'paid') return '✓ Paid';
  if (isPast(s)) return '⏳ Pending';
  if (s.status === 'tentative') return '⏰ Tentative';
  return 'Upcoming';
}
function gigStatusClass(s) {
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

// ── SHOW ROW ──
function makeShowRow(s) {
  const past = isPast(s);
  const row = document.createElement('div');
  row.className = 'show-row' + (past ? ' past' : '');
  const tentTag = s.status === 'tentative' ? `<span class="tentative-tag">· tentative</span>` : '';
  const pc = pillClass(s); const pl = pillLabel(s);
  const sc = gigStatusClass(s);
  row.innerHTML = `
    <div class="swipe-delete-bg">
      <button class="swipe-delete-btn" aria-label="Delete gig">
        <i class="ti ti-trash"></i><span>Delete</span>
      </button>
    </div>
    <div class="swipe-card-inner">
      <div class="date-pip ${sc}">
        <div class="mo">${MS[s.month]}</div><div class="dy">${s.day}</div>
      </div>
      <div class="show-body">
        <div class="artist-line"><span class="show-artist">${s.artist}</span>${tentTag}</div>
        <div class="show-meta"><span class="badge ${BC[s.type]||'other'}">${cap(s.type)}</span><span class="mdot">·</span><span>${s.city}</span></div>
      </div>
      <div class="show-right">
        <div class="pay-amount">${fmt(s.pay)}</div>
        <button class="pay-marker ${pc}">${pl}</button>
      </div>
    </div>`;
  row.addEventListener('click', (e) => {
    if (row.dataset.swiped === 'true') { snapBack(row); return; }
    if (!e.target.closest('.swipe-delete-btn') && !e.target.closest('.pay-marker')) openEdit(s.id);
  });
  row.querySelector('.pay-marker').addEventListener('click', function(e) { e.stopPropagation(); togglePayment(s.id, this); });

  // Swipe-left to reveal delete — only inner card slides
  const cardInner = row.querySelector('.swipe-card-inner');
  let touchStartX = 0, touchStartY = 0, isSwiping = false;
  const SNAP_THRESHOLD = 50;
  const DELETE_WIDTH = 80;

  row.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
    cardInner.style.transition = 'none';
  }, { passive: true });

  row.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (!isSwiping && Math.abs(dy) > Math.abs(dx)) return;
    if (dx < -8) {
      isSwiping = true;
      const clamped = Math.max(dx, -DELETE_WIDTH);
      cardInner.style.transform = `translateX(${clamped}px)`;
      e.preventDefault();
    } else if (dx > 4 && isSwiping) {
      cardInner.style.transform = 'translateX(0)';
    }
  }, { passive: false });

  row.addEventListener('touchend', () => {
    if (!isSwiping) return;
    const currentX = parseFloat(cardInner.style.transform.replace('translateX(', '')) || 0;
    cardInner.style.transition = 'transform 0.2s ease';
    if (currentX < -SNAP_THRESHOLD) {
      cardInner.style.transform = `translateX(-${DELETE_WIDTH}px)`;
      row.dataset.swiped = 'true';
    } else {
      cardInner.style.transform = 'translateX(0)';
      row.dataset.swiped = 'false';
    }
  });

  // Close if user taps elsewhere
  document.addEventListener('touchstart', (e) => {
    if (row.dataset.swiped === 'true' && !row.contains(e.target)) {
      cardInner.style.transition = 'transform 0.2s ease';
      cardInner.style.transform = 'translateX(0)';
      row.dataset.swiped = 'false';
    }
  }, { passive: true });

  // Delete button
  const delBtn = row.querySelector('.swipe-delete-btn');
  if (delBtn) {
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${s.artist}"?`)) {
        const idx = shows.findIndex(x => x.id === s.id);
        if (idx > -1) {
          const calId = shows[idx].calEventId;
          shows.splice(idx, 1);
          rebuildDashboard();
          saveData();
          if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
          if (calId) deleteCalendarEventNative(calId);
        }
      } else {
        cardInner.style.transition = 'transform 0.2s ease';
        cardInner.style.transform = 'translateX(0)';
        row.dataset.swiped = 'false';
      }
    });
  }

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
  const sorted = [...shows].sort((a,b) => new Date(a.year,a.month,a.day) - new Date(b.year,b.month,b.day));
  const upcoming = sorted.filter(s => !isPast(s));
  const completed = sorted.filter(s => isPast(s)).reverse();
  const thisMonthShows = shows.filter(isThisMonth);
  const projectedThisMonth = thisMonthShows.reduce((a,s) => a+s.pay, 0);
  const next = upcoming[0];
  document.getElementById('s-count').textContent = upcoming.length || '0';
  document.getElementById('s-earn').textContent = fmt(projectedThisMonth);
  document.getElementById('s-month-label').textContent = MO[today.getMonth()] + ' ' + today.getFullYear();
  if (next) { document.getElementById('s-next').textContent = MS[next.month]+' '+next.day; document.getElementById('s-next-d').textContent = next.artist.split(' ')[0]+' · '+next.city; }
  else { document.getElementById('s-next').textContent = '—'; document.getElementById('s-next-d').textContent = 'No upcoming gigs'; }
  renderGroupedList(document.getElementById('list-upcoming'), upcoming, 'No upcoming gigs — tap Add Gig');
  renderGroupedList(document.getElementById('list-completed'), completed, 'No completed gigs yet');
}

// ── EARNINGS ──
function rebuildEarnings() {
  const yr = today.getFullYear();

  // ── SECTION 1: CURRENT EARNINGS = paid gigs only ──
  const paidShows = shows.filter(s => s.payStatus === 'paid');
  const paidThisMonth = paidShows.filter(isThisMonth).reduce((a,s)=>a+s.pay,0);
  const paidThisYear = paidShows.filter(s=>s.year===yr).reduce((a,s)=>a+s.pay,0);
  const paidCount = paidShows.length;

  document.getElementById('e-current-total').textContent = fmt(paidThisYear);
  document.getElementById('e-current-month').textContent = fmt(paidThisMonth);
  document.getElementById('e-current-year').textContent = fmt(paidThisYear);
  document.getElementById('e-current-count').textContent = paidCount + ' gig' + (paidCount !== 1 ? 's' : '');

  // ── SECTION 2: PROJECTED EARNINGS = upcoming unpaid gigs ──
  // Confirmed upcoming not yet paid
  const projConfirmed = shows.filter(s => !isPast(s) && s.status === 'confirmed' && s.payStatus !== 'paid');
  const projTentative = shows.filter(s => !isPast(s) && s.status === 'tentative' && s.payStatus !== 'paid');
  // Past gigs with pending payment also count as projected
  const projPending = shows.filter(s => isPast(s) && s.payStatus === 'pending');

  const projConfTotal = projConfirmed.reduce((a,s)=>a+s.pay,0);
  const projTentTotal = projTentative.reduce((a,s)=>a+s.pay,0);
  const projPendTotal = projPending.reduce((a,s)=>a+s.pay,0);
  const projGrandTotal = projConfTotal + projTentTotal + projPendTotal;

  document.getElementById('e-proj-total').textContent = fmt(projGrandTotal);
  document.getElementById('e-proj-confirmed').textContent = fmt(projConfTotal);
  document.getElementById('e-proj-tentative').textContent = fmt(projTentTotal);
  document.getElementById('e-proj-pending').textContent = fmt(projPendTotal);

  // ── BAR CHART ──
  const monthlyConfirmed = Array(12).fill(0);
  const monthlyTentative = Array(12).fill(0);
  shows.filter(s=>s.year===yr).forEach(s => {
    if (s.status==='confirmed') monthlyConfirmed[s.month]+=s.pay;
    else monthlyTentative[s.month]+=s.pay;
  });
  const monthlyTotals = monthlyConfirmed.map((v,i)=>v+monthlyTentative[i]);
  const maxVal = Math.max(...monthlyTotals, 1);
  const barChart = document.getElementById('e-bar-chart');
  barChart.innerHTML = '';
  // Clear any existing tooltip
  const existingTip = document.getElementById('bar-tooltip');
  if (existingTip) existingTip.remove();

  monthlyTotals.forEach((val, i) => {
    const conf = monthlyConfirmed[i]; const tent = monthlyTentative[i];
    const confH = Math.round((conf/maxVal)*100); const tentH = Math.round((tent/maxVal)*100);
    const isNow = i===today.getMonth();
    const col = document.createElement('div');
    col.className = 'bar-col'+(isNow?' bar-now':'');
    col.innerHTML = `<div class="bar-wrap"><div class="bar-tent" style="height:${tentH}%"></div><div class="bar-conf" style="height:${confH}%"></div></div><div class="bar-label">${MS[i]}</div>`;

    if (val > 0) {
      col.style.cursor = 'pointer';
      col.addEventListener('click', (e) => {
        e.stopPropagation();
        // Remove existing tooltip
        const old = document.getElementById('bar-tooltip');
        if (old) { old.remove(); if (old._col === col) return; }
        // Build tooltip
        const tip = document.createElement('div');
        tip.id = 'bar-tooltip';
        tip._col = col;
        tip.className = 'bar-tooltip';
        tip.innerHTML = `<div class="bar-tip-month">${MO[i]}</div>
          <div class="bar-tip-row"><span>Confirmed</span><span>${fmt(conf)}</span></div>
          ${tent > 0 ? `<div class="bar-tip-row tentative"><span>Tentative</span><span>${fmt(tent)}</span></div>` : ''}
          <div class="bar-tip-total"><span>Total</span><span>${fmt(val)}</span></div>`;
        // Position above the bar column
        const chartRect = barChart.getBoundingClientRect();
        const colRect = col.getBoundingClientRect();
        barChart.style.position = 'relative';
        tip.style.position = 'absolute';
        const colLeft = colRect.left - chartRect.left;
        tip.style.left = Math.max(0, Math.min(colLeft - 40, chartRect.width - 160)) + 'px';
        tip.style.bottom = '100%';
        tip.style.marginBottom = '6px';
        barChart.appendChild(tip);
        // Close on outside click
        setTimeout(() => {
          const close = (ev) => { if (!tip.contains(ev.target)) { tip.remove(); document.removeEventListener('click', close); } };
          document.addEventListener('click', close);
        }, 10);
      });
    }
    barChart.appendChild(col);
  });

  // ── GIG TYPE BREAKDOWN ──
  const typeMap = {};
  shows.forEach(s => { typeMap[s.type]=(typeMap[s.type]||0)+s.pay; });
  const typeList = document.getElementById('e-type-list'); typeList.innerHTML = '';
  const totalPay = shows.reduce((a,s)=>a+s.pay,0)||1;
  const typeColors = {wedding:'#993556',corporate:'#534AB7',festival:'#1D9E75',pub:'#3B6D11',college:'#993C1D',other:'#6b7280'};
  Object.entries(typeMap).sort((a,b)=>b[1]-a[1]).forEach(([type,amt]) => {
    const pct = Math.round((amt/totalPay)*100);
    const row = document.createElement('div'); row.className = 'type-row';
    row.innerHTML = `<div class="type-dot" style="background:${typeColors[type]||'#6b7280'}"></div><span class="type-name">${cap(type)}</span><div class="type-bar-wrap"><div class="type-bar-fill" style="width:${pct}%;background:${typeColors[type]||'#6b7280'}"></div></div><span class="type-amt">${fmt(amt)}</span>`;
    typeList.appendChild(row);
  });
}

// ── AUTOCOMPLETE ──
function setupAutocomplete(inputId, dropdownId, getOptions, onSelect, allowCreate, createLabel) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  function showDropdown(query) {
    const all = getOptions();
    const q = query.trim().toLowerCase();
    // Show all when empty, filter when typing
    const opts = q ? all.filter(o => o.toLowerCase().includes(q)) : all;
    dropdown.innerHTML = '';
    opts.slice(0, 10).forEach(opt => {
      const item = document.createElement('div');
      item.className = 'ac-item';
      // Bold matching portion
      if (q) {
        const idx = opt.toLowerCase().indexOf(q);
        item.innerHTML = opt.slice(0, idx) + '<strong>' + opt.slice(idx, idx + q.length) + '</strong>' + opt.slice(idx + q.length);
      } else {
        item.textContent = opt;
      }
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        onSelect(opt);
        input.value = opt;
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(item);
    });
    // Show "+ Add" only when typed value doesn't match any existing option exactly
    if (allowCreate && q && !all.find(o => o.toLowerCase() === q)) {
      const addItem = document.createElement('div');
      addItem.className = 'ac-item ac-add';
      addItem.innerHTML = `<i class="ti ti-plus" style="font-size:12px"></i> ${createLabel}: "<strong>${query}</strong>"`;
      addItem.addEventListener('mousedown', e => {
        e.preventDefault();
        onSelect(query, true);
        input.value = query;
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(addItem);
    }
    dropdown.style.display = dropdown.children.length ? 'block' : 'none';
  }

  // Open with all options on tap/focus
  input.addEventListener('focus', () => { showDropdown(input.value); });
  // Filter live as user types
  input.addEventListener('input', () => { showDropdown(input.value); });
  // Close on blur with small delay to allow mousedown to fire
  input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 180));
  // Reopen if user taps an already-focused field (mobile tap)
  input.addEventListener('click', () => { if (dropdown.style.display === 'none') showDropdown(input.value); });
}

function initAutocompletes() {
  setupAutocomplete('fa','client-dropdown', getAllClients, (val, isNew) => {}, true, 'Add client');
  setupAutocomplete('fc','city-dropdown', getAllCities, (val, isNew) => {
    if (isNew) { customCities.push(val); localStorage.setItem('mf_cities', JSON.stringify(customCities)); }
  }, true, 'Add city');
  setupAutocomplete('ft-input','type-dropdown', getAllGigTypes, (val, isNew) => {
    if (isNew) { customGigTypes.push(val); localStorage.setItem('mf_gig_types', JSON.stringify(customGigTypes)); }
    document.getElementById('ft').value = val.toLowerCase();
  }, true, 'Add type');
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

// ── SHEET ──
function setSt(s) { selSt=s; document.getElementById('bc').className='tog-btn'+(s==='confirmed'?' sel-c':''); document.getElementById('bt').className='tog-btn'+(s==='tentative'?' sel-t':''); }
function setPaySt(s) { selPaySt=s; document.getElementById('bp-paid').className='pay-tog'+(s==='paid'?' sel-paid':''); document.getElementById('bp-pending').className='pay-tog'+(s==='pending'?' sel-pending':''); }

function openAdd(prefillDate) {
  editingId=null;
  document.getElementById('sheet-title').textContent='Add a new gig';
  document.getElementById('fa').value=''; document.getElementById('fc').value='';
  document.getElementById('ft-input').value=''; document.getElementById('ft').value='wedding';
  document.getElementById('fp').value=''; document.getElementById('fn').value='';
  document.getElementById('fd').value=prefillDate||'';
  setSt('confirmed'); setPaySt('pending');
  document.getElementById('save-btn').textContent='💾 Save Gig';
  document.getElementById('delete-wrap').innerHTML='';
  document.getElementById('toast').classList.remove('show');
  // Reset more details
  moreDetailsOpen=false;
  document.getElementById('more-details-body').style.display='none';
  document.getElementById('more-details-icon').className='ti ti-chevron-down';
  const lbl = document.getElementById('more-details-label');
  if (lbl) lbl.textContent='More details';
  openSheet();
}
function openEdit(showId) {
  const s=shows.find(x=>x.id===showId); if(!s) return;
  editingId=s.id;
  document.getElementById('sheet-title').textContent='Edit gig';
  document.getElementById('fa').value=s.artist;
  document.getElementById('ft-input').value=cap(s.type);
  document.getElementById('ft').value=s.type;
  document.getElementById('fd').value=`${s.year}-${String(s.month+1).padStart(2,'0')}-${String(s.day).padStart(2,'0')}`;
  document.getElementById('fc').value=s.city;
  document.getElementById('fp').value=s.pay||'';
  document.getElementById('fn').value=s.notes||'';
  setSt(s.status); setPaySt(s.payStatus==='upcoming'?'pending':s.payStatus);
  document.getElementById('save-btn').textContent='✓ Save changes';
  document.getElementById('delete-wrap').innerHTML='<button class="del-btn" id="del-btn">🗑 Delete gig</button>';
  document.getElementById('del-btn').addEventListener('click', deleteShow);
  document.getElementById('toast').classList.remove('show');
  // Show more details if notes exist
  if (s.notes) { moreDetailsOpen=true; document.getElementById('more-details-body').style.display='block'; document.getElementById('more-details-icon').className='ti ti-chevron-up'; }
  else { moreDetailsOpen=false; document.getElementById('more-details-body').style.display='none'; document.getElementById('more-details-icon').className='ti ti-chevron-down'; const lbl2=document.getElementById('more-details-label');if(lbl2)lbl2.textContent='More details'; }
  openSheet();
}
function openEditFromPreview() { const id=previewShowId; closePreview(); openEdit(id); }
function openSheet() { document.getElementById('overlay').classList.add('show'); }
function closeSheet() { document.getElementById('overlay').classList.remove('show'); }

async function saveShow() {
  const artist=document.getElementById('fa').value.trim();
  const typeRaw=document.getElementById('ft-input').value.trim();
  const type=document.getElementById('ft').value||typeRaw.toLowerCase()||'other';
  const date=document.getElementById('fd').value;
  const city=document.getElementById('fc').value.trim();
  const pay=parseInt(document.getElementById('fp').value)||0;
  const notes=document.getElementById('fn').value.trim();
  const calSync=document.getElementById('cs').checked;
  if (!artist||!date) { alert('Please enter at least a name and date.'); return; }
  const d=new Date(date+'T00:00:00');
  const mo=d.getMonth(),dy=d.getDate(),yr=d.getFullYear();
  const isUpcoming=new Date(yr,mo,dy)>=new Date(today.getFullYear(),today.getMonth(),today.getDate());
  const computedPayStatus=isUpcoming&&selPaySt==='pending'?'upcoming':selPaySt;

  // Save custom city/type if new
  if (city && !getAllCities().includes(city)) { customCities.push(city); localStorage.setItem('mf_cities',JSON.stringify(customCities)); }

  if (editingId) {
    const idx=shows.findIndex(s=>s.id===editingId);
    const existingCalId=shows[idx].calEventId||null;
    const updated={id:editingId,year:yr,month:mo,day:dy,artist,type,city,pay,status:selSt,payStatus:computedPayStatus,notes,calEventId:existingCalId};
    shows[idx]=updated;
    rebuildDashboard(); saveData();
    if (calSync&&existingCalId) updateCalendarEventNative(updated);
    else if (calSync&&!existingCalId) { const eid=await createCalendarEventNative(updated); if(eid){shows[idx].calEventId=eid;saveData();} }
  } else {
    const newGig={id:nextId++,year:yr,month:mo,day:dy,artist,type,city,pay,status:selSt,payStatus:computedPayStatus,notes,calEventId:null};
    shows.push(newGig);
    rebuildDashboard(); saveData();
    if (calSync) { const eid=await createCalendarEventNative(newGig); if(eid){const idx=shows.findIndex(s=>s.id===newGig.id);if(idx>-1){shows[idx].calEventId=eid;saveData();}} }
  }
  // Snappy close
  closeSheet();
  if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
}

async function deleteShow() {
  if (!editingId||!confirm('Delete this gig?')) return;
  const idx=shows.findIndex(s=>s.id===editingId);
  if (idx>-1) {
    const calId=shows[idx].calEventId;
    shows.splice(idx,1); rebuildDashboard(); saveData(); closeSheet();
    if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
    if (calId) deleteCalendarEventNative(calId);
  }
}

// ── CALENDAR ──
function showPreview(showId,dayEl) {
  const s=shows.find(x=>x.id===showId); if(!s) return;
  if (previewShowId===showId){closePreview();return;}
  previewShowId=showId;
  document.getElementById('pv-artist').textContent=s.artist;
  const b=document.getElementById('pv-badge');b.textContent=cap(s.type);b.className='badge '+(BC[s.type]||'other');
  document.getElementById('pv-city').textContent=s.city;
  document.getElementById('pv-date').textContent=`${s.day} ${MS[s.month]} ${s.year}`;
  const pe=document.getElementById('pv-pay');
  pe.textContent=fmt(s.pay)+(s.status==='tentative'?' (tentative)':'');
  pe.className='pv-pay'+(s.status==='tentative'?' dim':'');
  const card=document.getElementById('preview');
  const pr=document.getElementById('panel-calendar').getBoundingClientRect();
  const dr=dayEl.getBoundingClientRect(); const cp=document.getElementById('panel-calendar');
  let top=dr.bottom-pr.top+cp.scrollTop+4; let left=dr.left-pr.left;
  if(left+240>pr.width)left=pr.width-244; if(left<4)left=4;
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
    if(sd[d]){e.classList.add('hasshow');const dr=document.createElement('div');dr.className='dots-row';sd[d].forEach(s=>{const dot=document.createElement('div');dot.className='sdot'+(s.status==='tentative'?' t':'');dr.appendChild(dot);});e.appendChild(dr);const sid=sd[d][0].id;e.addEventListener('click',ev=>{ev.stopPropagation();showPreview(sid,e);});}
    else{e.addEventListener('click',ev=>{ev.stopPropagation();const dd=`${calY}-${String(calM+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;openAdd(dd);});}
    g.appendChild(e);
  }
  const rem=(7-(first+dim)%7)%7;for(let i=1;i<=rem;i++){const e=document.createElement('div');e.className='cday other';e.innerHTML=`<div class="dnum">${i}</div>`;g.appendChild(e);}
  const conf=ms.filter(s=>s.status==='confirmed').length;const earn=ms.reduce((a,s)=>a+s.pay,0);
  document.getElementById('cc').textContent=ms.length||'—';document.getElementById('ccf').textContent=conf||'—';document.getElementById('ce').textContent=ms.length?fmt(earn):'—';
  const ag=document.getElementById('agenda');ag.innerHTML='';
  if(ms.length){const h=document.createElement('div');h.className='sec-label';h.style.marginTop='14px';h.textContent='This month';ag.appendChild(h);
  [...ms].sort((a,b)=>a.day-b.day).forEach(s=>{const row=document.createElement('div');row.className='agenda-item';row.innerHTML=`<span class="ag-date">${MS[s.month]} ${s.day}</span><span class="ag-artist">${s.artist}</span><span class="badge ${BC[s.type]||'other'}" style="font-size:10px">${cap(s.type)}</span><span class="ag-pay">${fmt(s.pay)}</span>`;row.addEventListener('click',()=>openEdit(s.id));ag.appendChild(row);});}
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
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:`You are Musician's Friend, a warm personal assistant for a musician in India. Be concise and friendly. Use ₹. Gigs: ${JSON.stringify(shows)}.`,messages:[{role:'user',content:text}]})});
    const data=await res.json();const reply=data.content?.[0]?.text||"Could you rephrase that?";
    document.getElementById('tdots').classList.remove('show');
    const b=document.createElement('div');b.className='msg bot';
    b.innerHTML=`<div class="av"><i class="ti ti-music"></i></div><div class="bub">${reply}</div>`;
    msgs.appendChild(b);msgs.scrollTop=msgs.scrollHeight;
  } catch(e) {
    document.getElementById('tdots').classList.remove('show');
    const b=document.createElement('div');b.className='msg bot';
    b.innerHTML=`<div class="av"><i class="ti ti-music"></i></div><div class="bub">Sorry, had a hiccup! Try again.</div>`;
    msgs.appendChild(b);
  }
}

// ── SNAP BACK HELPER ──
function snapBack(row) {
  const inner = row.querySelector ? row.querySelector('.swipe-card-inner') : row;
  const target = inner || row;
  target.style.transition = 'transform 0.2s ease';
  target.style.transform = 'translateX(0)';
  row.dataset.swiped = 'false';
}

// ── EVENT LISTENERS ──
function setupEventListeners() {
  initAutocompletes();
  document.getElementById('fab').addEventListener('click',()=>openAdd());
  document.getElementById('bc').addEventListener('click',()=>setSt('confirmed'));
  document.getElementById('bt').addEventListener('click',()=>setSt('tentative'));
  document.getElementById('bp-paid').addEventListener('click',()=>setPaySt('paid'));
  document.getElementById('bp-pending').addEventListener('click',()=>setPaySt('pending'));
  document.getElementById('save-btn').addEventListener('click',saveShow);
  document.getElementById('overlay').addEventListener('click',e=>{if(e.target===document.getElementById('overlay'))closeSheet();});
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
  const moreBtn = document.getElementById('more-details-btn');
  if (moreBtn) moreBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleMoreDetails(); });
  const closeBtn = document.getElementById('sheet-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', e => { e.preventDefault(); closeSheet(); });

  // ── AUTO-REFRESH ON APP FOCUS ──
  let lastFetchTime = Date.now();
  const MIN_REFETCH_INTERVAL = 30000;

  async function refreshIfStale() {
    if (document.getElementById('overlay').classList.contains('show')) return;
    if (Date.now() - lastFetchTime < MIN_REFETCH_INTERVAL) return;
    lastFetchTime = Date.now();
    try {
      setSyncStatus('saving', 'Syncing...');
      const data = await loadFromDrive();
      if (data && data.shows) {
        shows = data.shows;
        nextId = shows.length > 0 ? Math.max(...shows.map(s => s.id)) + 1 : 1;
        rebuildDashboard();
        if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
        if (document.getElementById('panel-earnings').classList.contains('active')) rebuildEarnings();
        setSyncStatus('saved', 'Synced ✓');
      }
    } catch(e) { setSyncStatus('error', 'Sync failed'); }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfStale();
  });
  window.addEventListener('focus', () => refreshIfStale());

  // Manual refresh button
  const refreshBtn = document.getElementById('manual-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      if (refreshBtn.classList.contains('spinning')) return;
      refreshBtn.classList.add('spinning');
      lastFetchTime = 0; // force re-fetch regardless of interval
      await refreshIfStale();
      setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
    });
  }
}
