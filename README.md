# English Reflex — Speaking & Shadowing Practice

A responsive web app for practicing English speaking reflexes and shadowing.
Vietnamese prompt → think → speak from memory → reveal English → listen → shadow →
record → replay → optional speech check → next.

Content lives in a **Google Spreadsheet** (one tab per lesson). A tiny **Google
Apps Script** backend reads it and exposes a JSON endpoint. The frontend is a
plain static site hosted on **GitHub Pages** so the browser microphone works
(Apps Script iframes block mic access, so the UI cannot live there).

## Project structure

```
apps-script/            Google Apps Script backend (JSON API)
  appsscript.json
  Code.gs               doGet() returns lesson JSON
  SheetService.gs       Sheet access, validation, counting, IDs

web/                    Static frontend (deployed to GitHub Pages)
  index.html
  css/styles.css
  js/config.js          Sets API_URL to the Apps Script /exec endpoint
  js/state.js           Runtime state
  js/utils.js           Shuffle + question pooling
  js/data.js            fetch() the Apps Script JSON
  js/modal.js           Friendly in-app confirm/alert
  js/tts.js             Text-to-Speech
  js/recorder.js        MediaRecorder voice recording
  js/speech.js          Basic speech-to-text word matching
  js/ui.js              Screens, navigation, session/flashcard logic
  js/app.js             Bootstrap + event wiring

.github/workflows/pages.yml   Publishes web/ to GitHub Pages on every push
.clasp.json                   clasp config (scriptId; not a secret)
```

## How it works

```
Google Spreadsheet → Apps Script (JSON) → fetch → Frontend (GitHub Pages) → Practice
```

- **Dynamic lessons:** every tab named like `Lesson 3 - hotel` becomes a lesson.
- **Valid question:** row with BOTH Vietnamese and English filled. Header, empty
  rows, and rows missing either language are ignored.
- **Dynamic counts:** `questionCount === questions.length` — never assumed to be 20.
- **Practice by Lesson:** ALL questions, shuffled, no cap.
- **Review Multiple Lessons:** combine a lesson range into one pool, shuffle,
  take 20/30/50/100/All (default 20; capped at available; no duplicates).
- Data is fetched **once** on load and kept in memory.

## Setup from scratch (for anyone cloning this repo)

### 1. Prepare the Google Sheet
- Each lesson = one tab named `Lesson <number> - <topic>` (e.g. `Lesson 1 - supermarket`).
- Row 1 is a header (`Vietnamese | English`).
- Fill Vietnamese in column A, English in column B.

### 2. Deploy the Apps Script backend
```powershell
npm install -g @google/clasp
clasp login
# In apps-script/SheetService.gs, set SPREADSHEET_ID to your sheet's ID.
clasp create --type standalone --title "English Reflex API" --rootDir apps-script
clasp push --force
clasp deploy --description "v1"
```
Copy the printed `/exec` URL — this is your API endpoint.

### 3. Configure the frontend
Edit `web/js/config.js` and set `API_URL` to the `/exec` URL from step 2.

### 4. Publish to GitHub Pages
- Push this repo to GitHub.
- In the repo's **Settings → Pages**, set **Source: GitHub Actions**.
- The included workflow (`.github/workflows/pages.yml`) publishes `web/` on every
  push to `main`. The page URL appears at the top of the Pages settings.

## Working locally

Serve `web/` with any static server (browser can't fetch from `file://`):

```powershell
# Requires Node.js
npx serve web
# then open http://localhost:3000
```

## Adding content

- **New lesson:** add a tab `Lesson 6 - airport`, reload the app.
- **New questions:** add rows, reload the app.
- **Remove questions:** delete rows or clear a cell, reload.

No redeploy is needed for content changes — only for code changes.

## Browser limitations

- **TTS** (SpeechSynthesis): voices vary by device. The app picks the best English
  voice for the chosen accent, with fallback.
- **Recording** (MediaRecorder): needs microphone permission. Recordings stay in
  memory only (never uploaded).
- **Speech recognition**: Chrome/Edge only in practice. This is **word matching,
  not pronunciation scoring** — reports "words recognized", never a "score".
- Any of these failing is a non-blocking warning; core flashcard practice keeps working.
