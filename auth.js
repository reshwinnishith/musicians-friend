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
    prompt: 'consent',
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
  const stored = localStorage.getItem('mf_email');
  if (stored) return stored;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (data.email) { localStorage.setItem('mf_email', data.email); return data.email; }
  } catch(e) {}
  return null;
}

const DRIVE_FILE_ID_FIXED = '1De2UnGb763QAr5HBJOxN5HGplqzw2dqw';
async function findOrCreateDriveFile() { return DRIVE_FILE_ID_FIXED; }

async function loadFromDrive() {
  const token = getToken(); if (!token) return null;
  const fileId = await findOrCreateDriveFile(); if (!fileId) return null;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
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
        summary: `🎵 ${cap(show.type)} Gig — ${show.artist}`,
        location: `${show.city}, India`,
        description: `Artist: ${show.artist}\nType: ${cap(show.type)}\nCity: ${show.city}\nPayment: ₹${Number(show.pay).toLocaleString('en-IN')}\nStatus: ${cap(show.status)}${show.notes ? '\nNotes: ' + show.notes : ''}\n\nManaged by Musician's Friend`,
        start: { date: dateStr },
        end: { date: dateStr },
        colorId: '9'
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
        summary: `🎵 ${cap(show.type)} Gig — ${show.artist}`,
        location: `${show.city}, India`,
        description: `Artist: ${show.artist}\nType: ${cap(show.type)}\nCity: ${show.city}\nPayment: ₹${Number(show.pay).toLocaleString('en-IN')}\nStatus: ${cap(show.status)}${show.notes ? '\nNotes: ' + show.notes : ''}\n\nManaged by Musician's Friend`,
        start: { date: dateStr },
        end: { date: dateStr },
        colorId: '9'
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
  const token = getToken();
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
