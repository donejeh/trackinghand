# Tracking Hand — Webcam hand-tracking demos

A small collection of **browser-only** experiments that use your **webcam** and **Google MediaPipe Hands** (via CDN) to track hands and drive visuals or interactions. There is **no build step** and **no backend** in these demos; everything runs as static HTML, CSS, and JavaScript.

---

## What’s in this repo

| Path | Name | What it does |
|------|------|----------------|
| [`index.html`](index.html) | Hub | Landing page with links to all projects below. **Start here.** |
| [`hand-particles/`](hand-particles/) | 3D particle playground | [Three.js](https://threejs.org/) point cloud with shapes (sphere, heart, stars, text outline, etc.). Hand spread, position, and pinch change expansion, colors, and templates. |
| [`hand-piano/`](hand-piano/) | Gesture piano | [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) tones. Index-finger **horizontal** position picks a note on a one-octave keyboard. |
| [`hand-tracing/`](hand-tracing/) | Letter tracing (kids) | Tracing game: ghost letters, stroke order, stars, sounds. Index finger mapped onto a canvas; progress saved in **`localStorage`**. Curriculum lives in [`hand-tracing/curriculum.json`](hand-tracing/curriculum.json). |

### Shared tech

- **MediaPipe Hands** — hand landmarks from the camera (`@mediapipe/hands`, `@mediapipe/camera_utils` from jsDelivr).
- **Secure context** — Browsers only expose the camera reliably on **HTTPS** or **`http://localhost`** / **`http://127.0.0.1`**. Plain `http://something.test` may block or limit camera access depending on the browser.

---

## How to run

You only need to **serve the folder over HTTP** (any static file server). No `npm install` is required for the demos as shipped.

### Option A — Laragon (your setup)

1. Put or symlink this project under your Laragon `www` folder (e.g. `C:\laragon\www\php\trackinghand`).
2. Start Laragon (Apache/Nginx).
3. Open in the browser:
   - **Recommended:** `https://trackinghand.test/` (if SSL is enabled), or  
   - `http://localhost/trackinghand/` (path depends on your Laragon docroot).

If the camera does not start on a custom `.test` **HTTP** URL, try **HTTPS** for that vhost or use **localhost**.

### Option B — PHP built-in server (from this folder)

```bash
cd path/to/trackinghand
php -S localhost:8080
```

Then open: `http://localhost:8080/`

### Option C — VS Code / Cursor “Live Server” (or similar)

Open the repo root and serve `index.html` with your live-server extension; use a URL that counts as a **secure context** if the camera fails.

### What to open

- **Hub:** `/` or `/index.html`
- **Particles:** `/hand-particles/`
- **Piano:** `/hand-piano/`
- **Tracing:** `/hand-tracing/`

---

## Per-app tips

### hand-particles

- Allow **camera** when prompted.
- **Spread fingers** — particle expansion  
- **Move hand left/right** — color shift  
- **Pinch** thumb + index (short release / long hold) — change shape template  
- **D** — toggle landmark debug on the small preview  
- Preview: drag corner to **resize**; **double-click** to cycle small / medium / large  

### hand-piano

- **Click once** on the page if sound is blocked (browser autoplay policy).
- Move index finger **left/right** in frame to change note; keep finger in a comfortable vertical band (see on-screen hint).
- **D** — toggle skeleton on the camera preview.

### hand-tracing

- **Click** once if audio is muted until user gesture.
- **Pink/teal dot** on the big canvas = mapped fingertip; **teal** means you’re close enough to the **current stroke** to draw ink — move in front of the camera until the dot sits on the blue guide.
- **D** — toggle hand skeleton on the PiP video.
- **Redo stroke** / **Next letter** — as labeled.
- Progress: `localStorage` key `handTracingMVP` (unlocked letters, stars).

---

## Project layout

```
trackinghand/
├── index.html              # Hub
├── README.md               # This file
├── .gitignore
├── hand-particles/
│   ├── index.html
│   └── app.js
├── hand-piano/
│   ├── index.html
│   └── app.js
└── hand-tracing/
    ├── index.html
    ├── app.js
    └── curriculum.json     # Letters, strokes, hints
```

---

## Requirements

- A **modern desktop browser** (Chrome, Edge, Firefox — latest versions recommended).
- A **webcam** and permission to use it.
- **Network** access to load scripts and MediaPipe assets from **jsDelivr** (corporate firewalls or ad blockers sometimes block CDNs).

---

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| Camera never starts | Use **HTTPS** or **`http://localhost`** / **`127.0.0.1`**. Check browser site permissions for camera. |
| “Frames: 0” or no hand updates | Ad blocker / privacy extension blocking `@mediapipe` scripts or WASM; try another network or disable for this site. |
| Piano silent | **Click** the page once; check system volume. |
| Tracing: no red line | Move until the fingertip dot turns **teal** on the **highlighted** stroke (camera mapping, not the physical screen). |

---

## License / credits

- **MediaPipe** — Google.
- **Three.js** — threejs.org.
- App code in this repository is provided as demo / educational material; adjust licensing if you ship a product.
