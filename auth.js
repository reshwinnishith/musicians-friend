const CLIENT_ID = '1028172379465-3uf6632ei464sv3fivgf7t99rvbhg2ln.apps.googleusercontent.com';
const REDIRECT_URI = 'https://musicians-friend.vercel.app';
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

let accessToken = null;
let tokenExpiry = null;

function signInWithGoogle() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: SCOPES,
    prompt: 'select_account',
    include_granted_scopes: 'true'
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

function signOut() {
  accessToken = null; tokenExpiry = null;
  localStorage.removeItem('mf_token');
  localStorage.removeItem('mf_expiry');
  localStorage.removeItem('mf_email');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

function getToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) return accessToken;
  const stored = localStorage.getItem('mf_token');
  const expiry = localStorage.getItem('mf_expiry');
  if (stored && expiry && Date.now() < parseInt(expiry)) {
    accessToken = stored; tokenExpiry = parseInt(expiry); return accessToken;
  }
  return null;
}

async function silentRefresh() {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      client_id: '1028172379465-3uf6632ei464sv3fivgf7t99rvbhg2ln.apps.googleusercontent.com',
      redirect_uri: 'https://musicians-friend.vercel.app',
      response_type: 'token',
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
      prompt: 'none',
      include_granted_scopes: 'true'
    });
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    iframe.onload = () => {
      try {
        const hash = iframe.contentWindow.location.hash.substring(1);
        const p = new URLSearchParams(hash);
        const token = p.get('access_token');
        const expiresIn = p.get('expires_in');
        if (token) {
          accessToken = token;
          tokenExpiry = Date.now() + (parseInt(expiresIn) * 1000) - 60000;
          localStorage.setItem('mf_token', token);
          localStorage.setItem('mf_expiry', tokenExpiry.toString());
          resolve(true);
        } else { resolve(false); }
      } catch(e) { resolve(false); }
      document.body.removeChild(iframe);
    };
    iframe.onerror = () => { resolve(false); document.body.removeChild(iframe); };
    document.body.appendChild(iframe);
    setTimeout(() => { try { document.body.removeChild(iframe); } catch(e){} resolve(false); }, 5000);
  });
}

function handleOAuthCallback() {
  const hash = window.location.hash.substring(1);
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  const expiresIn = params.get('expires_in');
  if (!token) return false;
  accessToken = token;
  tokenExpiry = Date.now() + (parseInt(expiresIn) * 1000) - 60000;
  localStorage.setItem('mf_token', token);
  localStorage.setItem('mf_expiry', tokenExpiry.toString());
  window.history.replaceState({}, document.title, window.location.pathname);
  return true;
}

async function getUserEmail() {
  const storedEmail = localStorage.getItem('mf_email');
  if (storedEmail && localStorage.getItem('mf_name') !== null) return storedEmail;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (data.email) {
      localStorage.setItem('mf_email', data.email);
      const firstName = data.given_name || (data.name ? data.name.split(' ')[0] : null);
      if (firstName) localStorage.setItem('mf_name', firstName);
      return data.email;
    }
  } catch(e) {}
  return null;
}

// Canonical data file — 55 gigs, most recent, correct owner
const CANONICAL_FILE_ID = '1De2UnGb763QAr5HBJOxN5HGplqzw2dqw';
const DRIVE_FILE_NAME = 'musicians-friend-data.json';

async function findOrCreateDriveFile() {
  const token = getToken(); if (!token) return null;

  // Use cached ID if available
  const cached = localStorage.getItem('mf_drive_file_id') || CANONICAL_FILE_ID;

  // Verify it's accessible with current token
  try {
    const check = await fetch(
      `https://www.googleapis.com/drive/v3/files/${cached}?fields=id`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (check.ok) {
      localStorage.setItem('mf_drive_file_id', cached);
      return cached;
    }
  } catch(e) {}

  // Fallback: search for any musicians-friend file
  try {
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const search = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await search.json();
    if (data.files && data.files.length > 0) {
      const id = data.files[0].id;
      localStorage.setItem('mf_drive_file_id', id);
      return id;
    }
  } catch(e) { console.error('Drive search error:', e); }

  // Last resort: create a new file
  try {
    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: 'application/json' })
    });
    const file = await create.json();
    if (file.id) { localStorage.setItem('mf_drive_file_id', file.id); return file.id; }
  } catch(e) { console.error('Drive create error:', e); }

  return null;
}

async function loadFromDrive() {
  const token = getToken(); if (!token) return null;
  const fileId = await findOrCreateDriveFile(); if (!fileId) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim() === '') return { shows: [] };
    return JSON.parse(text);
  } catch(e) { console.error('Drive load error:', e); return null; }
}

async function saveToDriveNative(data) {
  const token = getToken(); if (!token) return false;
  const fileId = await findOrCreateDriveFile(); if (!fileId) return false;
  try {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }
    );
    return res.ok;
  } catch(e) { return false; }
}

async function createCalendarEventNative(show) {
  const token = getToken(); if (!token) return null;
  const dateStr = `${show.year}-${String(show.month+1).padStart(2,'0')}-${String(show.day).padStart(2,'0')}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: show.slot ? `🎵 ${cap(show.slot)} · ${cap(show.type)} Gig — ${show.artist}` : `🎵 ${cap(show.type)} Gig — ${show.artist}`,
        location: show.venue ? `${show.venue}, ${show.city}, India` : `${show.city}, India`,
        description: `Artist: ${show.artist}\nType: ${cap(show.type)}\nCity: ${show.city}${show.venue ? '\nVenue: ' + show.venue : ''}\nPayment: ₹${Number(show.pay).toLocaleString('en-IN')}\nStatus: ${cap(show.status)}${show.notes ? '\nNotes: ' + show.notes : ''}\n\nManaged by Musician's Friend`,
        start: { date: dateStr },
        end: { date: dateStr },
        colorId: show.status === 'tentative' ? '6' : '11'
      })
    });
    const data = await res.json();
    return data.id || null;
  } catch(e) { return null; }
}

async function updateCalendarEventNative(show) {
  const token = getToken(); if (!token || !show.calEventId) return;
  const dateStr = `${show.year}-${String(show.month+1).padStart(2,'0')}-${String(show.day).padStart(2,'0')}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${show.calEventId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: show.slot ? `🎵 ${cap(show.slot)} · ${cap(show.type)} Gig — ${show.artist}` : `🎵 ${cap(show.type)} Gig — ${show.artist}`,
        location: show.venue ? `${show.venue}, ${show.city}, India` : `${show.city}, India`,
        description: `Artist: ${show.artist}\nType: ${cap(show.type)}\nCity: ${show.city}${show.venue ? '\nVenue: ' + show.venue : ''}\nPayment: ₹${Number(show.pay).toLocaleString('en-IN')}\nStatus: ${cap(show.status)}${show.notes ? '\nNotes: ' + show.notes : ''}\n\nManaged by Musician's Friend`,
        start: { date: dateStr },
        end: { date: dateStr },
        colorId: show.status === 'tentative' ? '6' : '11'
      })
    });
  } catch(e) {}
}

async function deleteCalendarEventNative(calEventId) {
  const token = getToken(); if (!token || !calEventId) return;
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${calEventId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
  } catch(e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('signin-btn')?.addEventListener('click', signInWithGoogle);
  document.getElementById('signout-btn')?.addEventListener('click', signOut);
  handleOAuthCallback();
  let token = getToken();
  if (!token) { token = await silentRefresh() ? getToken() : null; }
  if (token) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    const email = await getUserEmail();
    if (email) { const el = document.getElementById('user-email'); if (el) el.textContent = email; }
    if (typeof initApp === 'function') initApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});
