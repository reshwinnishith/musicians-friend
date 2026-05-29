# Musician's Friend 🎵

Your personal music gig manager — tracks shows, earnings, payments, and syncs to Google Drive.

## Files
- `index.html` — main app shell
- `style.css` — all styles (dark mode aware)
- `app.js` — all logic, Drive sync, chat AI
- `manifest.json` — PWA manifest (add to home screen)

## Setup
1. Push this folder to a GitHub repo
2. Connect the repo to Vercel
3. Deploy — done

## Google Drive sync
The app reads and writes gig data to a file in your Google Drive.
File ID is hardcoded in `app.js` — do not change it.

## Notes
- Drive sync requires the app to be opened via Claude.ai (credentials are passed through the Anthropic API)
- All data is stored in your personal Google Drive
- The app works offline in read mode if Drive is unavailable

<!-- Lucy was here. -->
<!-- Phase 3.5 complete. -->
