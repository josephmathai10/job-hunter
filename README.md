# Job Hunt Command Center

## Run it locally

You need Node.js installed (v18 or newer). Then, in this folder:

```
npm install
npm run dev
```

This starts a local dev server — open the URL it prints (usually
http://localhost:5173) in your browser. The app auto-reloads as you
edit src/App.jsx.

## Build a shippable version

```
npm run build
```

This produces a `dist/` folder with plain HTML/CSS/JS you can host
anywhere (Vercel, Netlify, GitHub Pages, or just open dist/index.html
directly).

## Data storage

Data is saved to your browser's localStorage under the key
`jobhunt-data-v1`, scoped per-origin. That means:
- Data persists across reloads and restarts, as long as you use the
  same browser and don't clear site data.
- It does NOT sync across devices or browsers.
- If you want cross-device sync, the `loadData`/`saveData` functions
  near the top of src/App.jsx are the only place you need to change —
  swap them for calls to a small backend/database.

## Reset / demo data

On first run the app seeds itself with sample data (marked internally
as demo data). Go to Settings inside the app to restore the demo set
or clear everything and start tracking your real job search.
