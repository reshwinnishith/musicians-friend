// ── CONFIG ──
const DRIVE_FILE_ID = '12xR-tHn8ViEQQqHVKcm0mzSZ3Lbihdv2';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const CALENDAR_MCP = { type: 'url', url: 'https://calendarmcp.googleapis.com/mcp/v1', name: 'google-calendar' };
const DRIVE_MCP = { type: 'url', url: 'https://drivemcp.googleapis.com/mcp/v1', name: 'google-drive' };

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

// ── CONSTANTS ──
const MO = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BC = {wedding:'wedding',pub:'pub',corporate:'corporate',college:'college',festival:'festival',other:'other'};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = n => '₹' + Number(n).toLocaleString('en-IN');
const isPast = s => new Date(s.year, s.month, s.day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());

// ── SYNC STATUS ──
function setSyncStatus(state, label) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (dot) { dot.className = 'sync-dot ' + state; }
  if (lbl) { lbl.textContent = label; }
}

// ── DRIVE: LOAD ──
async function loadFromDrive() {
  setSyncStatus('saving', 'Loading...');
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: 'You are a data retrieval assistant. Use the Google Drive MCP tool to download the specified file. Return ONLY the raw JSON content — no explanation, no markdown, no code fences. Just the JSON object.',
        messages: [{ role: 'user', content: `Download Google Drive file ID: ${DRIVE_FILE_ID} and return only its raw JSON content.` }],
        mcp_servers: [DRIVE_MCP]
      })
    });
    const data = await res.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    // strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    shows = parsed.shows || [];
    nextId = shows.length > 0 ? Math.max(...shows.map(s => s.id)) + 1 : 1;
    setSyncStatus('saved', 'Synced');
  } catch(e) {
    console.error('Drive load error:', e);
    setSyncStatus('error', 'Offline mode');
    shows = [];
  }
  document.getElementById('loading-screen').classList.add('hidden');
  rebuildDashboard();
}

// ── DRIVE: SAVE ──
async function saveToDrive() {
  setSyncStatus('saving', 'Saving...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const payload = JSON.stringify({ shows, lastUpdated: new Date().toISOString() });
      await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 200,
          system: 'You are a file update assistant. Use the Google Drive MCP tool to update the specified file with the given JSON content. Reply with just "saved".',
          messages: [{ role: 'user', content: `Update Google Drive file ID ${DRIVE_FILE_ID} with this exact content:\n${payload}` }],
          mcp_servers: [DRIVE_MCP]
        })
      });
      setSyncStatus('saved', 'Saved');
    } catch(e) {
      console.error('Drive save error:', e);
      setSyncStatus('error', 'Save failed');
    }
  }, 1500);
}

// ── CALENDAR: HELPERS ──
function gigToCalTitle(s) {
  return `🎵 ${cap(s.type)} Gig — ${s.artist}`;
}
function gigToCalDescription(s) {
  return [
    `<b>Artist / Client:</b> ${s.artist}`,
    `<b>Gig type:</b> ${cap(s.type)}`,
    `<b>City:</b> ${s.city}`,
    `<b>Payment:</b> ${fmt(s.pay)}`,
    `<b>Status:</b> ${cap(s.status)}`,
    s.notes ? `<b>Notes:</b> ${s.notes}` : '',
    `<br><i>Managed by Musician's Friend</i>`
  ].filter(Boolean).join('<br>');
}
function gigToDateString(s) {
  // Returns ISO date string YYYY-MM-DD
  return `${s.year}-${String(s.month + 1).padStart(2,'0')}-${String(s.day).padStart(2,'0')}`;
}

// ── CALENDAR: CREATE EVENT ──
async function createCalendarEvent(s) {
  try {
    const dateStr = gigToDateString(s);
    // All-day event: start = date, end = next day
    const startTime = `${dateStr}T00:00:00`;
    const endTime = `${dateStr}T23:59:00`;
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: `You are a calendar assistant. Use the Google Calendar MCP tool to create an event with these exact details and return ONLY the event ID from the result — nothing else, just the raw event ID string.`,
        messages: [{
          role: 'user',
          content: `Create a Google Calendar event with:
- Title: "${gigToCalTitle(s)}"
- Start: ${startTime}
- End: ${endTime}
- Location: ${s.city}, India
- Description: ${gigToCalDescription(s)}
- TimeZone: Asia/Kolkata
- Color: 9 (Blueberry)
Return only the event ID.`
        }],
        mcp_servers: [CALENDAR_MCP]
      })
    });
    const data = await res.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    // Extract just the event ID — it's typically a long alphanumeric string
    const match = text.match(/[a-z0-9]{20,}/i);
    return match ? match[0] : null;
  } catch(e) {
    console.error('Calendar create error:', e);
    return null;
  }
}

// ── CALENDAR: UPDATE EVENT ──
async function updateCalendarEvent(s) {
  if (!s.calEventId) return;
  try {
    const dateStr = gigToDateString(s);
    const startTime = `${dateStr}T00:00:00`;
    const endTime = `${dateStr}T23:59:00`;
    await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: 'You are a calendar assistant. Use the Google Calendar MCP tool to update the event. Reply with just "updated".',
        messages: [{
          role: 'user',
          content: `Update Google Calendar event ID "${s.calEventId}" with:
- Title: "${gigToCalTitle(s)}"
- Start: ${startTime}
- End: ${endTime}
- Location: ${s.city}, India
- Description: ${gigToCalDescription(s)}`
        }],
        mcp_servers: [CALENDAR_MCP]
      })
    });
  } catch(e) {
    console.error('Calendar update error:', e);
  }
}

// ── CALENDAR: DELETE EVENT ──
async function deleteCalendarEvent(calEventId) {
  if (!calEventId) return;
  try {
    await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: 'You are a calendar assistant. Use the Google Calendar MCP tool to delete the event. Reply with just "deleted".',
        messages: [{
          role: 'user',
          content: `Delete Google Calendar event with ID: "${calEventId}"`
        }],
        mcp_servers: [CALENDAR_MCP]
      })
    });
  } catch(e) {
    console.error('Calendar delete error:', e);
  }
}

// ── TAB NAVIGATION ──
function switchTab(tab, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  el.classList.add('active');
  closePreview();
  closeConfirm();
  if (tab === 'calendar') renderCal();
  if (tab === 'dashboard') rebuildDashboard();
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
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';
  popup.classList.add('show');
}
function closeConfirm() {
  document.getElementById('confirm-popup').classList.remove('show');
  confirmCallback = null;
}

// ── PAYMENT TOGGLE ──
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
  const s = shows.find(x => x.id === showId);
  if (!s) return;
  const past = isPast(s);
  let newStatus, msg;
  if (!past) {
    newStatus = s.payStatus === 'paid' ? 'upcoming' : 'paid';
    msg = newStatus === 'paid' ? 'Mark as Paid?' : 'Mark as Upcoming?';
  } else {
    newStatus = s.payStatus === 'paid' ? 'pending' : 'paid';
    msg = newStatus === 'paid' ? 'Mark as Paid?' : 'Mark as Pending?';
  }
  showConfirm(msg, btn, () => {
    s.payStatus = newStatus;
    rebuildDashboard();
    rebuildEarnings();
    saveToDrive();
  });
}

// ── SHOW ROW ──
function makeShowRow(s) {
  const past = isPast(s);
  const row = document.createElement('div');
  row.className = 'show-row' + (past ? ' past' : '');
  const pipClass = past ? 'date-pip past-pip' : 'date-pip';
  const tentTag = s.status === 'tentative' ? `<span class="tentative-tag">· tentative</span>` : '';
  const pc = pillClass(s);
  const pl = pillLabel(s);
  row.innerHTML = `
    <div class="${pipClass}"><div class="mo">${MS[s.month]}</div><div class="dy">${s.day}</div></div>
    <div class="show-body">
      <div class="artist-line"><span class="show-artist">${s.artist}</span>${tentTag}</div>
      <div class="show-meta"><span class="badge ${BC[s.type] || 'other'}">${cap(s.type)}</span><span class="mdot">·</span><span>${s.city}</span></div>
    </div>
    <div class="show-right">
      <div class="pay-amount">${fmt(s.pay)}</div>
      <button class="pay-marker ${pc}">${pl}</button>
    </div>`;
  row.querySelector('.pay-marker').addEventListener('click', function(e) {
    e.stopPropagation();
    togglePayment(s.id, this);
  });
  return row;
}

// ── DASHBOARD ──
function rebuildDashboard() {
  const sorted = [...shows].sort((a, b) => new Date(a.year, a.month, a.day) - new Date(b.year, b.month, b.day));
  const upcoming = sorted.filter(s => !isPast(s));
  const completed = sorted.filter(s => isPast(s)).reverse();
  const total = shows.reduce((a, s) => a + s.pay, 0);
  const next = upcoming[0];
  document.getElementById('s-count').textContent = upcoming.length || '0';
  document.getElementById('s-earn').textContent = fmt(total);
  document.getElementById('s-month-label').textContent = MO[today.getMonth()] + ' ' + today.getFullYear();
  if (next) {
    document.getElementById('s-next').textContent = MS[next.month] + ' ' + next.day;
    document.getElementById('s-next-d').textContent = next.artist.split(' ')[0] + ' · ' + next.city;
  } else {
    document.getElementById('s-next').textContent = '—';
    document.getElementById('s-next-d').textContent = 'No upcoming gigs';
  }
  const lu = document.getElementById('list-upcoming');
  lu.innerHTML = '';
  if (!upcoming.length) lu.innerHTML = '<div class="empty-state">No upcoming gigs — tap <strong>Add Gig</strong></div>';
  else upcoming.forEach(s => lu.appendChild(makeShowRow(s)));
  const lc = document.getElementById('list-completed');
  lc.innerHTML = '';
  if (!completed.length) lc.innerHTML = '<div class="empty-state">No completed gigs yet</div>';
  else completed.forEach(s => lc.appendChild(makeShowRow(s)));
  rebuildEarnings();
}

// ── EARNINGS ──
function rebuildEarnings() {
  const total = shows.reduce((a, s) => a + s.pay, 0);
  document.getElementById('e-total').textContent = fmt(total);
  document.getElementById('e-avg').textContent = fmt(shows.length ? Math.round(total / shows.length) : 0);
  document.getElementById('e-count').textContent = shows.length + ' gigs';
  const list = document.getElementById('earn-list');
  list.innerHTML = '';
  [...shows].sort((a, b) => new Date(a.year, a.month, a.day) - new Date(b.year, b.month, b.day)).forEach(s => {
    const pc = pillClass(s);
    const pl = pillLabel(s);
    const row = document.createElement('div');
    row.className = 'erow';
    row.innerHTML = `
      <span style="color:var(--muted);font-size:12px">${MS[s.month]} ${s.day} · ${cap(s.type)} · ${s.city}</span>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
        <span style="font-weight:600;color:var(--ink)">${fmt(s.pay)}</span>
        <button class="pay-marker ${pc}" style="font-size:10px">${pl}</button>
      </div>`;
    row.querySelector('.pay-marker').addEventListener('click', function(e) {
      e.stopPropagation();
      togglePayment(s.id, this);
    });
    list.appendChild(row);
  });
}

// ── SHEET ──
function setSt(s) {
  selSt = s;
  document.getElementById('bc').className = 'tog-btn' + (s === 'confirmed' ? ' sel-c' : '');
  document.getElementById('bt').className = 'tog-btn' + (s === 'tentative' ? ' sel-t' : '');
}
function setPaySt(s) {
  selPaySt = s;
  document.getElementById('bp-paid').className = 'pay-tog' + (s === 'paid' ? ' sel-paid' : '');
  document.getElementById('bp-pending').className = 'pay-tog' + (s === 'pending' ? ' sel-pending' : '');
}
function openAdd(prefillDate) {
  editingId = null;
  document.getElementById('sheet-title').textContent = 'Add a new gig';
  ['fa','fc','fp','fn'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('ft').value = 'wedding';
  document.getElementById('fd').value = prefillDate || '';
  setSt('confirmed');
  setPaySt('pending');
  document.getElementById('save-btn').textContent = '💾 Save Gig';
  document.getElementById('delete-wrap').innerHTML = '';
  document.getElementById('toast').classList.remove('show');
  openSheet();
}
function openEdit(showId) {
  const s = shows.find(x => x.id === showId);
  if (!s) return;
  editingId = s.id;
  document.getElementById('sheet-title').textContent = 'Edit gig';
  document.getElementById('fa').value = s.artist;
  document.getElementById('ft').value = s.type;
  document.getElementById('fd').value = String(s.year) + '-' + String(s.month + 1).padStart(2, '0') + '-' + String(s.day).padStart(2, '0');
  document.getElementById('fc').value = s.city;
  document.getElementById('fp').value = s.pay || '';
  document.getElementById('fn').value = s.notes || '';
  setSt(s.status);
  setPaySt(s.payStatus === 'upcoming' ? 'pending' : s.payStatus);
  document.getElementById('save-btn').textContent = '✓ Save changes';
  document.getElementById('delete-wrap').innerHTML = '<button class="del-btn" id="del-btn">🗑 Delete gig</button>';
  document.getElementById('del-btn').addEventListener('click', deleteShow);
  document.getElementById('toast').classList.remove('show');
  openSheet();
}
function openEditFromPreview() {
  const id = previewShowId;
  closePreview();
  openEdit(id);
}
function openSheet() {
  document.getElementById('overlay').classList.add('show');
}
function closeSheet() {
  document.getElementById('overlay').classList.remove('show');
}

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
    const existingCalEventId = shows[idx].calEventId || null;
    const updated = { id: editingId, year: yr, month: mo, day: dy, artist, type, city, pay, status: selSt, payStatus: computedPayStatus, notes, calEventId: existingCalEventId };
    shows[idx] = updated;
    showToast('Changes saved!');
    rebuildDashboard();
    saveToDrive();
    // Update calendar event in background if it exists
    if (calSync && existingCalEventId) {
      updateCalendarEvent(updated);
    } else if (calSync && !existingCalEventId) {
      // Wasn't synced before — create now
      setSyncStatus('saving', 'Syncing calendar...');
      const eventId = await createCalendarEvent(updated);
      if (eventId) { shows[idx].calEventId = eventId; saveToDrive(); }
      setSyncStatus('saved', 'Saved');
    }
  } else {
    const newGig = { id: nextId++, year: yr, month: mo, day: dy, artist, type, city, pay, status: selSt, payStatus: computedPayStatus, notes, calEventId: null };
    shows.push(newGig);
    showToast('Gig saved!');
    rebuildDashboard();
    saveToDrive();
    // Create calendar event in background
    if (calSync) {
      setSyncStatus('saving', 'Syncing calendar...');
      const eventId = await createCalendarEvent(newGig);
      if (eventId) {
        const idx = shows.findIndex(s => s.id === newGig.id);
        if (idx > -1) { shows[idx].calEventId = eventId; saveToDrive(); }
        setSyncStatus('saved', 'Calendar synced ✓');
      } else {
        setSyncStatus('saved', 'Saved (calendar skipped)');
      }
    }
  }

  setTimeout(() => {
    closeSheet();
    if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
  }, 1400);
}

async function deleteShow() {
  if (!editingId) return;
  if (!confirm('Delete this gig? This cannot be undone.')) return;
  const idx = shows.findIndex(s => s.id === editingId);
  if (idx > -1) {
    const calEventId = shows[idx].calEventId;
    shows.splice(idx, 1);
    rebuildDashboard();
    saveToDrive();
    closeSheet();
    if (document.getElementById('panel-calendar').classList.contains('active')) renderCal();
    // Delete calendar event in background
    if (calEventId) deleteCalendarEvent(calEventId);
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = '✓ ' + msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1400);
}

// ── CALENDAR PREVIEW ──
function showPreview(showId, dayEl) {
  const s = shows.find(x => x.id === showId);
  if (!s) return;
  if (previewShowId === showId) { closePreview(); return; }
  previewShowId = showId;
  document.getElementById('pv-artist').textContent = s.artist;
  const b = document.getElementById('pv-badge');
  b.textContent = cap(s.type);
  b.className = 'badge ' + (BC[s.type] || 'other');
  document.getElementById('pv-city').textContent = s.city;
  document.getElementById('pv-date').textContent = s.day + ' ' + MS[s.month] + ' ' + s.year;
  const pe = document.getElementById('pv-pay');
  pe.textContent = fmt(s.pay) + (s.status === 'tentative' ? ' (tentative)' : '');
  pe.className = 'pv-pay' + (s.status === 'tentative' ? ' dim' : '');
  const card = document.getElementById('preview');
  const pr = document.getElementById('panel-calendar').getBoundingClientRect();
  const dr = dayEl.getBoundingClientRect();
  const cp = document.getElementById('panel-calendar');
  let top = dr.bottom - pr.top + cp.scrollTop + 4;
  let left = dr.left - pr.left;
  if (left + 240 > pr.width) left = pr.width - 244;
  if (left < 4) left = 4;
  if (top + 180 > pr.height) top = dr.top - pr.top + cp.scrollTop - 190;
  card.style.top = top + 'px';
  card.style.left = left + 'px';
  card.classList.add('show');
  document.querySelectorAll('.cday.selected').forEach(d => d.classList.remove('selected'));
  dayEl.classList.add('selected');
}
function closePreview() {
  previewShowId = null;
  document.getElementById('preview').classList.remove('show');
  document.querySelectorAll('.cday.selected').forEach(d => d.classList.remove('selected'));
}

// ── CALENDAR RENDER ──
function renderCal() {
  closePreview();
  document.getElementById('cal-title').textContent = MO[calM] + ' ' + calY;
  const g = document.getElementById('cal-grid');
  g.innerHTML = '';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    const e = document.createElement('div');
    e.className = 'dow';
    e.textContent = d;
    g.appendChild(e);
  });
  const first = new Date(calY, calM, 1).getDay();
  const dim = new Date(calY, calM + 1, 0).getDate();
  const dip = new Date(calY, calM, 0).getDate();
  const ms = shows.filter(s => s.year === calY && s.month === calM);
  const sd = {};
  ms.forEach(s => { if (!sd[s.day]) sd[s.day] = []; sd[s.day].push(s); });
  for (let i = 0; i < first; i++) {
    const e = document.createElement('div');
    e.className = 'cday other';
    e.innerHTML = `<div class="dnum">${dip - first + 1 + i}</div>`;
    g.appendChild(e);
  }
  for (let d = 1; d <= dim; d++) {
    const e = document.createElement('div');
    e.className = 'cday';
    const isToday = today.getFullYear() === calY && today.getMonth() === calM && today.getDate() === d;
    if (isToday) e.classList.add('today');
    e.innerHTML = `<div class="dnum">${d}</div>`;
    if (sd[d]) {
      e.classList.add('hasshow');
      const dr = document.createElement('div');
      dr.className = 'dots-row';
      sd[d].forEach(s => {
        const dot = document.createElement('div');
        dot.className = 'sdot' + (s.status === 'tentative' ? ' t' : '');
        dr.appendChild(dot);
      });
      e.appendChild(dr);
      const sid = sd[d][0].id;
      e.addEventListener('click', ev => { ev.stopPropagation(); showPreview(sid, e); });
    } else {
      e.addEventListener('click', ev => {
        ev.stopPropagation();
        const dd = String(calY) + '-' + String(calM + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        openAdd(dd);
      });
    }
    g.appendChild(e);
  }
  const rem = (7 - (first + dim) % 7) % 7;
  for (let i = 1; i <= rem; i++) {
    const e = document.createElement('div');
    e.className = 'cday other';
    e.innerHTML = `<div class="dnum">${i}</div>`;
    g.appendChild(e);
  }
  const conf = ms.filter(s => s.status === 'confirmed').length;
  const earn = ms.reduce((a, s) => a + s.pay, 0);
  document.getElementById('cc').textContent = ms.length || '—';
  document.getElementById('ccf').textContent = conf || '—';
  document.getElementById('ce').textContent = ms.length ? fmt(earn) : '—';
  const ag = document.getElementById('agenda');
  ag.innerHTML = '';
  if (ms.length) {
    const h = document.createElement('div');
    h.className = 'sec-label';
    h.style.marginTop = '14px';
    h.textContent = 'This month';
    ag.appendChild(h);
    [...ms].sort((a, b) => a.day - b.day).forEach(s => {
      const row = document.createElement('div');
      row.className = 'agenda-item';
      row.innerHTML = `
        <span class="ag-date">${MS[s.month]} ${s.day}</span>
        <span class="ag-artist">${s.artist}</span>
        <span class="badge ${BC[s.type] || 'other'}" style="font-size:10px">${cap(s.type)}</span>
        <span class="ag-pay ${s.status === 'tentative' ? 'dim' : ''}">${fmt(s.pay)}</span>`;
      row.addEventListener('click', () => openEdit(s.id));
      ag.appendChild(row);
    });
  }
}

// ── CHAT ──
async function sendMsg() {
  const inp = document.getElementById('cin');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  inp.style.height = 'auto';
  const msgs = document.getElementById('chat-msgs');
  const u = document.createElement('div');
  u.className = 'msg user';
  u.innerHTML = `<div class="av"><i class="ti ti-user"></i></div><div class="bub">${text}</div>`;
  msgs.appendChild(u);
  msgs.scrollTop = msgs.scrollHeight;
  document.getElementById('tdots').classList.add('show');
  try {
    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        system: `You are Musician's Friend, a warm personal assistant for a musician in India. Be concise and friendly. Use ₹ for currency. Current gigs data: ${JSON.stringify(shows)}. payStatus can be: upcoming (not yet paid, future gig), paid (payment received), pending (past gig, payment not yet received). If the user mentions a new gig, suggest tapping the "Add Gig" button. Answer questions about schedule, earnings, and collaborators based on the data.`,
        messages: [{ role: 'user', content: text }]
      })
    });
    const data = await res.json();
    const reply = data.content?.[0]?.text || "Could you rephrase that?";
    document.getElementById('tdots').classList.remove('show');
    const b = document.createElement('div');
    b.className = 'msg bot';
    b.innerHTML = `<div class="av"><i class="ti ti-music"></i></div><div class="bub">${reply}</div>`;
    msgs.appendChild(b);
    msgs.scrollTop = msgs.scrollHeight;
  } catch(e) {
    document.getElementById('tdots').classList.remove('show');
    const b = document.createElement('div');
    b.className = 'msg bot';
    b.innerHTML = `<div class="av"><i class="ti ti-music"></i></div><div class="bub">Sorry, had a hiccup! Try again in a moment.</div>`;
    msgs.appendChild(b);
  }
}

// ── EVENT LISTENERS ──
document.addEventListener('DOMContentLoaded', () => {
  // FAB
  document.getElementById('fab').addEventListener('click', () => openAdd());

  // Sheet buttons
  document.getElementById('bc').addEventListener('click', () => setSt('confirmed'));
  document.getElementById('bt').addEventListener('click', () => setSt('tentative'));
  document.getElementById('bp-paid').addEventListener('click', () => setPaySt('paid'));
  document.getElementById('bp-pending').addEventListener('click', () => setPaySt('pending'));
  document.getElementById('save-btn').addEventListener('click', saveShow);

  // Overlay close
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('overlay')) closeSheet();
  });

  // Calendar nav
  document.getElementById('cal-prev').addEventListener('click', e => {
    e.stopPropagation();
    calM--; if (calM < 0) { calM = 11; calY--; } renderCal();
  });
  document.getElementById('cal-next').addEventListener('click', e => {
    e.stopPropagation();
    calM++; if (calM > 11) { calM = 0; calY++; } renderCal();
  });

  // Calendar panel click — close preview
  document.getElementById('panel-calendar').addEventListener('click', e => {
    if (!e.target.closest('.preview-card') && !e.target.closest('.cday')) closePreview();
  });

  // Preview
  document.getElementById('pv-close').addEventListener('click', closePreview);
  document.getElementById('pv-edit').addEventListener('click', openEditFromPreview);

  // Confirm popup
  document.getElementById('confirm-yes').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  });
  document.getElementById('confirm-no').addEventListener('click', closeConfirm);
  document.addEventListener('click', e => {
    if (!e.target.closest('.confirm-popup') && !e.target.closest('.pay-marker')) closeConfirm();
  });

  // Chat
  document.getElementById('send-btn').addEventListener('click', sendMsg);
  document.getElementById('cin').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
  });
  document.getElementById('cin').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
  });

  // Load data
  loadFromDrive();
});
