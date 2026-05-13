// ── GOOGLE OAUTH CONFIG ──
const CLIENT_ID = '1028172379465-3uf6632ei464sv3fivgf7t99rvbhg2ln.apps.googleusercontent.com';
const REDIRECT_URI = 'https://musicians-friend.vercel.app';
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

let accessToken = null;
let tokenExpiry = null;

// ── SIGN IN ──
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

// ── SIGN OUT ──
function signOut() {
  accessToken = null;
  tokenExpiry = null;
  sessionStorage.removeItem('mf_token');
  sessionStorage.removeItem('mf_expiry');
  sessionStorage.removeItem('mf_email');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

// ── CHECK TOKEN ──
function getToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }
  // Check session storage
  const stored = sessionStorage.getItem('mf_token');
  const expiry = sessionStorage.getItem('mf_expiry');
  if (stored && expiry && Date.now() < parseInt(expiry)) {
    accessToken = stored;
    tokenExpiry = parseInt(expiry);
    return accessToken;
  }
  return null;
}

// ── HANDLE OAUTH CALLBACK (token in URL hash) ──
function handleOAuthCallback() {
  const hash = window.location.hash.substring(1);
  if (!hash) return false;
  const params = new URLSearchParams(hash);
  const token = params.get('access_token');
  const expiresIn = params.get('expires_in');
  if (!token) return false;

  accessToken = token;
  tokenExpiry = Date.now() + (parseInt(expiresIn) * 1000) - 60000; // 1 min buffer
  sessionStorage.setItem('mf_token', token);
  sessionStorage.setItem('mf_expiry', tokenExpiry.toString());

  // Clean URL
  window.history.replaceState({}, document.title, window.location.pathname);
  return true;
}

// ── GET USER EMAIL ──
async function getUserEmail() {
  const stored = sessionStorage.getItem('mf_email');
  if (stored) return stored;
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    if (data.email) {
      sessionStorage.setItem('mf_email', data.email);
      return data.email;
    }
  } catch(e) {}
  return null;
}

// ── DRIVE: FILE ID (fixed — always use this file) ──
const DRIVE_FILE_ID_FIXED = '1De2UnGb763QAr5HBJOxN5HGplqzw2dqw';

async function findOrCreateDriveFile() {
  return DRIVE_FILE_ID_FIXED;
}

// ── DRIVE: LOAD DATA ──
async function loadFromDrive() {
  const token = getToken();
  if (!token) return null;
  const fileId = await findOrCreateDriveFile();
  if (!fileId) return null;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.trim() === '') return { shows: [] };
    return JSON.parse(text);
  } catch(e) {
    console.error('Drive load error:', e);
    return null;
  }
}

// ── DRIVE: SAVE DATA ──
async function saveToDriveNative(data) {
  const token = getToken();
  if (!token) return false;
  const fileId = await findOrCreateDriveFile();
  if (!fileId) return false;
  try {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      }
    );
    return res.ok;
  } catch(e) {
    console.error('Drive save error:', e);
    return false;
  }
}

// ── CALENDAR: CREATE EVENT ──
async function createCalendarEventNative(show) {
  const token = getToken();
  if (!token) return null;
  const dateStr = `${show.year}-${String(show.month+1).padStart(2,'0')}-${String(show.day).padStart(2,'0')}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: `🎵 ${cap(show.type)} Gig — ${show.artist}`,
        location: `${show.city}, India`,
        description: `Artist: ${show.artist}\nType: ${cap(show.type)}\nCity: ${show.city}\nPayment: ₹${Number(show.pay).toLocaleString('en-IN')}\nStatus: ${cap(show.status)}\n${show.notes ? 'Notes: ' + show.notes : ''}\n\nManaged by Musician's Friend`,
        start: { date: dateStr },
        end: { date: dateStr },
        colorId: '9'
      })
    });
    const data = await res.json();
    return data.id || null;
  } catch(e) {
    console.error('Calendar create error:', e);
    return null;
  }
}

// ── CALENDAR: UPDATE EVENT ──
async function updateCalendarEventNative(show) {
  const token = getToken();
  if (!token || !show.calEventId) return;
  const dateStr = `${show.year}-${String(show.month+1).padStart(2,'0')}-${String(show.day).padStart(2,'0')}`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${show.calEventId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: `🎵 ${cap(show.type)} Gig — ${show.artist}`,
        location: `${show.city}, India`,
        description: `Artist: ${show.artist}\nType: ${cap(show.type)}\nCity: ${show.city}\nPayment: ₹${Number(show.pay).toLocaleString('en-IN')}\nStatus: ${cap(show.status)}\n${show.notes ? 'Notes: ' + show.notes : ''}\n\nManaged by Musician's Friend`,
        start: { date: dateStr },
        end: { date: dateStr },
        colorId: '9'
      })
    });
  } catch(e) {
    console.error('Calendar update error:', e);
  }
}

// ── CALENDAR: DELETE EVENT ──
async function deleteCalendarEventNative(calEventId) {
  const token = getToken();
  if (!token || !calEventId) return;
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${calEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch(e) {
    console.error('Calendar delete error:', e);
  }
}

// ── INIT: CHECK AUTH STATE ON LOAD ──
document.addEventListener('DOMContentLoaded', async () => {
  const signinBtn = document.getElementById('signin-btn');
  if (signinBtn) signinBtn.addEventListener('click', signInWithGoogle);

  const signoutBtn = document.getElementById('signout-btn');
  if (signoutBtn) signoutBtn.addEventListener('click', signOut);

  // Check if returning from OAuth
  const justAuthed = handleOAuthCallback();

  // Check if we have a valid token
  const token = getToken();

  if (token) {
    // Show app, hide login
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Show user email
    const email = await getUserEmail();
    if (email) {
      const emailEl = document.getElementById('user-email');
      if (emailEl) emailEl.textContent = email;
    }

    // Init app
    if (typeof initApp === 'function') initApp();
  } else {
    // Show login
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});
