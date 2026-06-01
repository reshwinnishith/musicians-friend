# Musician's Friend — AI Context Briefing

This document exists to brief an AI with zero prior context on what this project is, how it works, and what to watch out for.

---

## What this app is

Musician's Friend is a lightweight personal gig management PWA for a working musician based in India. It lets the owner track gigs and rehearsals, view upcoming shows in a dashboard and calendar, analyse monthly earnings, and sync events to Google Calendar. It is designed for one user only — there is no multi-user system, no backend, and no server-side logic. All data lives in the owner's Google Drive. It is deployed publicly on Vercel but only accessible to someone who can log in.

---

## Tech stack

- **Frontend:** Vanilla HTML/CSS/JS — no framework, no build step
- **Hosting:** Vercel (auto-deploys from GitHub `main` branch)
- **Data persistence:** Single JSON file (`musicians-friend-data.json`) stored in the owner's Google Drive, read/written directly from the browser via the Drive REST API
- **Auth:** Google OAuth 2.0 implicit flow + a local username/password fallback (see Architecture notes)
- **Calendar:** Google Calendar API v3, called directly from the browser
- **PWA:** `manifest.json` + `service-worker.js` — installable on iOS/Android

---

## Architecture notes

### Key files

| File | Role |
|---|---|
| `index.html` | App shell, all panels, login screen, changelog UI |
| `style.css` | All styles, CSS custom properties for light/dark theming |
| `app.js` | All app logic — dashboard, calendar, earnings, gig/rehearsal CRUD, Drive sync, event listeners |
| `auth.js` | OAuth flow, token management, Drive file I/O, Calendar API calls |
| `service-worker.js` | PWA offline caching |
| `manifest.json` | PWA metadata |
| `CLAUDE.md` | Standing rules for AI commits (version bumps, changelog) |

### Auth flow

There are two login paths:

**Google OAuth (primary):**
1. User taps "Sign in with Google" → full redirect to `accounts.google.com` with `response_type: 'token'`
2. Google redirects back with `#access_token=...&expires_in=3599` in the URL hash
3. `handleOAuthCallback()` reads the token, stores it in `localStorage` (`mf_token`, `mf_expiry`), strips the hash
4. `getToken()` is called everywhere Drive/Calendar is needed — checks in-memory first, then localStorage, returns `null` if expired
5. Silent refresh via hidden iframe (`silentRefresh()`) is attempted on load if no valid token is found

**Pin login (fallback):**
1. User enters username/password — checked client-side against hardcoded values
2. On match, `localStorage.setItem('mf_pin_auth', 'true')` is set
3. `checkPinLogin()` runs first on every page load — if flag is set, it calls `initApp()` directly and returns, skipping OAuth entirely
4. Pin users have **no Google token** — Drive and Calendar calls all guard with `if (!token) return null/false` and silently no-op. The app loads from `localStorage` cache (`mf_cached_shows`) if available; saves fail visibly with "Save failed" in the status bar

**Logout** clears both `mf_token` and `mf_pin_auth`.

### Data flow

- `loadFromDrive()` → fetches `musicians-friend-data.json` from Drive → parses `{ shows: [...] }`
- `saveData()` → debounced 1.5s → `saveToDriveNative()` → PATCH to Drive upload API
- `mf_cached_shows` in localStorage is updated on every successful load and used as fallback when Drive returns null or throws
- Calendar sync is per-operation (create/update/delete gig) and gated on a per-form checkbox — `calEventId` is stored on each show object

---

## Known issues / gotchas

**OAuth implicit flow is deprecated by Google.** `response_type: 'token'` is the legacy implicit grant. Tokens cannot be refreshed without a redirect or an iframe hack. Google has been soft-deprecating this since 2019. It still works but the correct replacement is PKCE + authorization code flow, which requires a small serverless function to exchange the code. Not a current priority.

**Silent refresh is fragile.** `silentRefresh()` uses a hidden iframe with `prompt: 'none'`. This fails silently in Safari (ITP blocks third-party cookies) and increasingly in Chromium-based browsers. If the user's Google session has expired and silent refresh fails, they see the login screen. The pin login exists partly as a workaround for this.

**Pin login means no Drive or Calendar access.** This is intentional — pin login is for read-only access to cached data. All Drive writes return `false` (visible "Save failed" in status bar). All Calendar operations are silent no-ops. Any gig added while pin-logged-in will not persist across sessions.

**`initApp()` null path uses cache, not Drive.** When `loadFromDrive()` returns `null` (pin login, or Drive unreachable), `initApp()` checks `mf_cached_shows` before defaulting to an empty array. The `catch` block (network error) also checks cache but additionally shows an offline banner and sets error status. The `null` return path intentionally does not show a banner.

**Auto-refresh on focus sets status to "Ready" when Drive returns null.** Without this fix, the sync status would get stuck on "Syncing…" after every app focus event for pin users.

**`CANONICAL_FILE_ID` is hardcoded in auth.js.** `findOrCreateDriveFile()` first tries the hardcoded file ID before falling back to a Drive search. This file ID is the correct canonical data file. If it becomes inaccessible (e.g. permissions change), the fallback searches by filename then creates a new file.

---

## Standing rules (from CLAUDE.md)

**Every commit must:**

1. Bump the version number in `index.html` in **both** places:
   - `<span class="app-version">vX.X.X</span>` (line ~67)
   - `<span class="cl-version">vX.X.X</span>` inside the most recent `.cl-group` (line ~345)
   - Use patch bumps (v4.8.0 → v4.8.1) unless the change is significant, then minor (v4.8.x → v4.9.0)

2. Add a new `.cl-group` changelog entry prepended inside the `.settings-whatsnew` div:
   ```html
   <div class="cl-group">
     <div class="cl-date-label">DD Month YYYY</div>
     <div class="cl-entry">
       <div class="cl-dot"></div>
       <div class="cl-content">
         <span class="cl-version">vX.X.X</span>
         <div class="cl-item">Plain English description of what changed.</div>
       </div>
     </div>
   </div>
   ```

No exceptions. Even one-line fixes need a version bump and changelog entry.

---

## Current status

**Version:** v4.8.0 (as of 30 May 2026)

**What works:**
- Dashboard with upcoming/completed gig list, swipe-to-delete, hero card showing next gig
- Calendar with month grid and agenda view
- Earnings analytics with monthly breakdown
- Rehearsal system (yellow identity, optional gig link, no earnings counting)
- Google Calendar sync with colour coding (tentative = banana, confirmed = sage)
- Searchable autocomplete dropdowns for artist, city, venue, jampad
- Auto-refresh on app focus (30s debounce)
- Delete confirmation modal
- Multi-purpose FAB (Add Gig / Add Rehearsal)
- Morning/Afternoon/Evening slot field on gigs
- Privacy mode (hides financial values behind ••••••)
- Google OAuth login + silent refresh
- Pin login fallback with cached data read
- Light/dark/auto theming via CSS custom properties
- PWA — installable on iOS/Android

**Known limitations / not implemented:**
- Pin login cannot save data or sync calendar (no Google token)
- Silent refresh unreliable on Safari
- OAuth implicit flow is deprecated — no background token refresh
- No multi-user support
- No push notifications
- No AI/chat features
