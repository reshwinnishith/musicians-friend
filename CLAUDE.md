## Standing Rule: Version Bump on Every Change

Every time you make ANY change to this project, you MUST also:

1. Bump the version number in index.html in BOTH places:
   - Line ~60: <span class="app-version">vX.X.X</span>
   - Line ~338: <span class="cl-version">vX.X.X</span>
   Use patch version bumps (e.g. v4.6.7 → v4.6.8) unless the change is 
   significant, in which case bump the minor version (v4.6.x → v4.7.0).
   Remove the -lucy-test suffix — use clean version numbers going forward.

2. Add a new changelog entry in index.html immediately after line ~331 
   (inside the .settings-whatsnew div), prepending a new .cl-group block 
   in this exact format:

   <div class="cl-group">
     <div class="cl-date-label">DD Month YYYY</div>
     <div class="cl-entry">
       <div class="cl-dot"></div>
       <div class="cl-content">
         <span class="cl-version">vX.X.X</span>
         <div class="cl-item">Brief description of what changed.</div>
       </div>
     </div>
   </div>

   Use today's date. Write the description in plain English, one sentence,
   describing what actually changed from the user's perspective.

This rule applies to every commit, no exceptions. Even small fixes must 
bump the version and add a changelog entry.

---

# Musician's Friend — Project Context

## What this is
A lightweight personal gig management PWA for a working musician. Deployed on Vercel, connected to Google Drive and Google Calendar.

## Core philosophy
- Mobile-first, fast, low-friction
- Native app-like feel
- Operational clarity over feature overload
- Avoid unnecessary complexity or architecture rewrites

## Stack
- Vanilla HTML/CSS/JS (no framework)
- Google OAuth (implicit flow)
- Google Drive API for data persistence
- Google Calendar API for event sync
- Deployed on Vercel via GitHub

## Files
- index.html — app shell, all panels
- style.css — all styles
- app.js — all logic
- auth.js — OAuth, Drive, Calendar API calls

## Current focus
- UX refinement
- Interaction polish
- Mobile usability
- Visual consistency
- Reliability and stability

## NOT current priorities
- AI/chat features
- Collaboration systems
- Advanced analytics
- Push notifications
- Major backend rewrites

## Implemented features
- Dashboard with gig list (swipe-to-delete)
- Calendar with month grid and agenda
- Earnings analytics
- Rehearsal system (yellow identity, optional gig link)
- Google Calendar sync with colour coding
- Searchable autocomplete dropdowns
- Auto-refresh on app focus
- Delete confirmation modal
- Multi-purpose FAB (Add Gig / Add Rehearsal)

## Rehearsal rules
- Same shows array as gigs, eventType: 'rehearsal'
- Fields: date, jampad, artist, notes, time (optional), linkedGigId (optional)
- Do NOT count toward earnings
- Yellow visual identity — subtle, not loud
- No status (confirmed/tentative) — rehearsals just exist

## Design preferences
- Avoid visually heavy or cluttered UI
- Prefer subtle native-feeling interactions
- iOS-like interaction patterns
- Breathing room and clean hierarchy
- Avoid extra taps or steps
- Avoid flashy animations

## Development rules
- ALWAYS bump the version in index.html with every commit
- Version format: vX.X.X (major.minor.patch)
- Always commit and push directly to main unless told otherwise
- Commit message format: "vX.X.X description of change"
- Prefer small targeted changes over large rewrites
- Preserve existing architecture where possible
