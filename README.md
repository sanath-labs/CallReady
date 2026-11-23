# CallReady — Online Class & Video Call Readiness Checker

> **DCN Mini-Project** · Data Communication and Networking  
> A fully browser-based network performance analysis tool. No server, no database, no paid services — every number shown is a real measurement made in your browser.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [Phase 1 — Core measurements](#phase-1--core-measurements)
  - [Phase 2 — Advanced analytics](#phase-2--advanced-analytics)
  - [Phase 3 — Visualizations](#phase-3--visualizations)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Testing Each Feature](#testing-each-feature)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
- [Technology Stack](#technology-stack)

---

## Overview

CallReady checks your internet connection quality **before** you join an online class, video call, voice call or online interview. It measures latency, jitter and download speed using your browser and a public CORS-enabled test server, then gives you a plain-language verdict and practical advice — all without installing anything.

---

## Features

### Phase 1 — Core measurements

| Feature | Detail |
|---|---|
| **Activity selection** | Choose from Online Class, Video Call, Voice Call or Online Interview to get a verdict tailored to that activity's requirements |
| **Connectivity check** | Confirms your browser can reach the internet test server; shows "Connected" or "Disconnected" with the reason |
| **Latency** | 8 timed requests to `speed.cloudflare.com`; reports average, fastest, slowest and a sparkline chart |
| **Jitter** | Average absolute difference between consecutive response times |
| **Download speed** | ~10 MB timed download with a live progress bar; reports Mbps |
| **Readiness verdicts** | Good / Average / Poor for each of the four activities, with reasons and limited-confidence notes |
| **Upload & packet loss** | Shown as "Not Available" with an explanation (browser cannot measure these reliably) |

**Thresholds used:**

| Activity | Good — Download | Good — Latency | Good — Jitter |
|---|---|---|---|
| Online Class | ≥ 5 Mbps | ≤ 150 ms | ≤ 30 ms |
| Video Call | ≥ 8 Mbps | ≤ 120 ms | ≤ 30 ms |
| Voice Call | ≥ 1 Mbps | ≤ 150 ms | ≤ 30 ms |
| Online Interview | ≥ 5 Mbps | ≤ 120 ms | ≤ 30 ms |

---

### Phase 2 — Advanced analytics

| Feature | Detail |
|---|---|
| **Network Health Score (0–100)** | Weighted formula: Download 40% + Latency 30% + Jitter 30%. Missing metrics are excluded and weights are redistributed. Bands: 80–100 Good, 50–79 Average, 0–49 Poor |
| **Network Problem Finder** | Analyses actual results and surfaces specific problems (slow speed, high latency, unstable connection) with plain-language explanations and step-by-step fixes |
| **Performance Dashboard** | Chart.js charts — latency line chart, jitter bar chart, download speed history, health score doughnut |
| **Before & After Comparison** | Save any test as your "Before" baseline, run another test, see a comparison table and bar charts with delta indicators (↑/↓/About the same) |
| **Connection History** | Every test saved in browser LocalStorage (up to 50 entries). View date, activity and all measurements. Delete individual rows, set any row as the "Before" baseline, or clear all |
| **Meeting Preparation Checklist** | Checks internet connection, network readiness, microphone permission, and camera permission. Microphone/camera only requested on demand; turned off immediately after checking |
| **Browser Readiness** | Reports whether WebRTC, MediaDevices API, LocalStorage, Fetch API and Performance API are supported |
| **Downloadable Report** | Generates a self-contained HTML report with all measurements, score, verdicts, problems and recommendations. Also supports Print / Save as PDF |

---

### Phase 3 — Visualizations

| Feature | Detail |
|---|---|
| **Live download gauge** | Animated circular gauge updates in real-time while the download test runs; scale adjusts to your speed |
| **Speed gauges** | Circular gauges for download (from latest test) and upload (shown as N/A) on the Dashboard |
| **Activity readiness visuals** | Three-segment colour bar for each activity (Poor / Average / Good) with current status highlighted |
| **Health score before & after** | Bar chart in the Before & After section comparing scores |
| **Dashboard loading state** | Dashboard dims and shows "Updating with your latest test…" while a test runs, with a shimmer animation |

---

## Project Structure

```
CallReady/
├── index.html              Main page (all sections)
├── README.md               This file
└── static/
    ├── css/
    │   └── style.css       All styles — Phase 1, Phase 2, Phase 3
    └── js/
        ├── script.js       Phase 1: measurements, readiness, results display
        │                   Also dispatches custom events (callready:start,
        │                   callready:progress, callready:results, callready:end)
        ├── phase2.js       Phase 2: health score, problem finder, Chart.js dashboard,
        │                   before/after comparison, LocalStorage history, checklist, report buttons
        ├── phase3.js       Phase 3: live gauge, speed gauges, activity visuals,
        │                   loading state, health score comparison chart
        └── report.js       Phase 2: report builder (download HTML + print/PDF)
```

**Script load order** (bottom of `index.html`):
1. `script.js` — runs first, sets up Phase 1 and dispatches events
2. `chart.js` — loaded from jsDelivr CDN (version 4.4.1, pinned)
3. `report.js` — sets up report download/print buttons
4. `phase2.js` — listens for `callready:results` event, renders analytics
5. `phase3.js` — listens for `callready:start/progress/results/end` events, renders visuals

---

## Getting Started

### Requirements

- **Python 3** (for the local server) — [python.org](https://www.python.org/downloads/)  
  Tick **"Add Python to PATH"** during installation.
- A modern browser: **Chrome**, **Edge** or **Firefox** (latest version)

### Run locally (Windows)

```powershell
cd path\to\CallReady
python -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

> **Why a local server?** Opening `index.html` directly with `file://` causes browsers to block the camera/microphone checks (they require a secure context). `localhost` counts as secure.

### Run locally (Mac / Linux)

```bash
cd path/to/CallReady
python3 -m http.server 8000
```

Then open **http://localhost:8000**.

### VS Code — Live Server extension

1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html` → **Open with Live Server**.

The app opens at `http://127.0.0.1:5500` automatically.

---

## How It Works

### Connectivity check
A `no-cors` fetch to `speed.cloudflare.com/__down?bytes=0` with a 5-second timeout. If the fetch resolves, the connection is considered active. `no-cors` avoids needing CORS headers on the response — we only care whether the request reached the server.

### Latency & jitter
8 sequential timed requests to the same endpoint. Each is measured with `performance.now()`. The first request is dropped (it includes DNS lookup and TLS handshake) when enough samples exist. Jitter is the average of the absolute differences between consecutive round-trip times.

### Download speed
A single fetch of `speed.cloudflare.com/__down?bytes=10000000` (~10 MB). The response body is read chunk by chunk using the Streams API. Total bytes received divided by elapsed time gives Mbps. A cache-buster query parameter ensures the browser never serves a cached copy.

### Health score formula
```
score = (dl_sub × 0.4) + (lat_sub × 0.3) + (jitter_sub × 0.3)
```
Each sub-score is a linear interpolation between a "perfect" anchor (100 points) and a "zero" anchor (0 points):
- Download: perfect = 50 Mbps, zero = 0 Mbps
- Latency: perfect = 20 ms, zero = 500 ms (lower is better)
- Jitter: perfect = 0 ms, zero = 150 ms (lower is better)

If a metric is unavailable, it is excluded and the remaining weights are scaled proportionally.

### Event system
`script.js` dispatches four `CustomEvent`s on `document`:

| Event | When | Detail payload |
|---|---|---|
| `callready:start` | Test begins | — |
| `callready:progress` | Download chunk received | `{ fraction, mbps }` |
| `callready:results` | Test complete | Full results object |
| `callready:end` | Test finished (pass or fail) | — |

Phase 2 and Phase 3 listen for these events — they never modify Phase 1 code.

### LocalStorage schema
History is stored under key `callready.history.v1` as a JSON array, newest entry first. Each entry:

```json
{
  "id": "unique-id",
  "at": "2026-11-23T01:00:00.000Z",
  "activity": "video",
  "download": 42.3,
  "latency": 68,
  "jitter": 12,
  "score": 87,
  "band": "good",
  "connected": true,
  "readiness": {
    "class": "good",
    "video": "good",
    "voice": "good",
    "interview": "good"
  }
}
```

The "Before" baseline is stored separately under `callready.baseline.v1`.

---

## Configuration

### `static/js/script.js`

```js
const CONFIG = {
  pingUrl: "https://speed.cloudflare.com/__down?bytes=0",
  downloadUrl: "https://speed.cloudflare.com/__down?bytes=10000000",
  downloadBytes: 10000000,   // must match bytes= above
  latencySamples: 8,
  pingTimeoutMs: 5000,
  downloadTimeoutMs: 30000
};
```

Change `pingUrl` / `downloadUrl` to any public CORS-enabled endpoint if `speed.cloudflare.com` is blocked on your network.

### `static/js/phase2.js`

```js
const SCORE = {
  weights: { download: 0.4, latency: 0.3, jitter: 0.3 },
  download: { perfect: 50, zero: 0 },   // Mbps
  latency:  { perfect: 20, zero: 500 },  // ms
  jitter:   { perfect: 0,  zero: 150 },  // ms
  bands:    { good: 80, average: 50 }
};

const SAME = { mbps: 0.5, ms: 5, score: 3 }; // "about the same" thresholds
```

---

## Testing Each Feature

### Phase 1
| Feature | How to test | Expected result |
|---|---|---|
| Homepage | Open `http://localhost:8000` | Hero, four activity cards and Start button appear |
| Activity selection | Click a card | Card highlights; test panel shows the activity name. Click again to deselect |
| Connectivity check | Run test with Wi-Fi on | "Connected" appears |
| No internet | Turn Wi-Fi off, run test | "Disconnected" with retry button; no speeds shown |
| Latency & jitter | Run a test | Average, fastest, slowest, jitter and sparkline chart appear |
| Download speed | Run a test | Gauge shows Mbps; progress updates live |
| Readiness verdicts | Run a test | Four verdict cards; video and interview note upload is not measured |
| Upload & packet loss | Run a test | Both show "Not Available" |
| Run again | Click "Run test again" | Test re-runs and results refresh |
| Mobile layout | Press F12, toggle device toolbar | Layout adapts; no horizontal scrolling |

### Phase 2
| Feature | How to test | Expected result |
|---|---|---|
| Health score | Run a test | A 0–100 ring appears with the formula |
| Problem finder | Run on a congested network | Problems match the measurements |
| Dashboard charts | Run two or more tests | Latency, jitter, download history and score charts fill in |
| Before & After | Click "Save as Before", fix something, run again | Comparison table, verdict and bar charts appear |
| History | Run a few tests | Rows appear; Delete removes one; Clear all asks for confirmation |
| Meeting checklist | Click "Run all checks" | Items show green/amber/red; camera and microphone requested on demand |
| Browser readiness | Open Checklist section | Each browser API shows Supported or Not Supported |
| Download report | Click "Download report" | An HTML file is saved; opening it shows all measurements |
| Print / PDF | Click "Print / Save as PDF" | Print dialog opens; "Save as PDF" saves a formatted report |

### Phase 3
| Feature | How to test | Expected result |
|---|---|---|
| Live gauge | Start a test; watch the test panel | Gauge animates during the download; hides when test ends |
| Speed gauges | Open Dashboard after a test | Download shows the measured value; Upload shows N/A |
| Activity visuals | Open Dashboard after a test | Colour bar matches the verdict for each activity |
| Loading state | Start a test with Dashboard visible | Dashboard dims; shimmer animation; "Updating…" label shown |
| Score comparison | Save Before, run another test, open Before & After | Bar chart shows Before vs After score |

---

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `python` not recognized | Reinstall Python and tick "Add Python to PATH", or use `py -m http.server 8000` |
| Port 8000 already in use | Use `python -m http.server 8080` and open `localhost:8080` |
| Download shows "Not Available" | The test server may be blocked by your network or firewall. Try another network, or change `CONFIG.downloadUrl` |
| Connection always "Disconnected" | Check firewall, VPN or proxy settings. Try a different network |
| Charts missing, "Chart.js unavailable" | Chart.js loads from jsDelivr CDN — check your internet connection and reload with `Ctrl+F5`. All other features still work |
| Camera / microphone check fails | Use `http://localhost:8000`, not a `file://` path. Click the lock icon in the address bar, set the device to Allow, then reload |
| History shows "Browser storage is unavailable" | Your browser is blocking LocalStorage. Allow site data for this page, or try another browser |
| Changes not appearing | Hard-refresh with `Ctrl+F5` |
| `callready.history.v1` data missing after reload | LocalStorage is not shared between `file://` and `http://localhost`. Always use the local server |

---

## Known Limitations

- **Latency** measured in a browser includes browser overhead (task scheduling, event loop), so it is an approximation, not a pure network round-trip time.
- **Download speed** depends on the test server load and your network's current traffic — run multiple tests to get a reliable picture.
- **Upload speed** cannot be tested reliably without a dedicated server endpoint that accepts large POST bodies with CORS headers.
- **Packet loss** cannot be measured from a browser — it requires raw socket access.
- **Health score, problem finder and readiness thresholds** use documented educational estimates, not official ITU or industry standards.
- **History** is stored only in the browser's LocalStorage on the device you used. Clearing browser data removes it. No cloud sync.
- **Before & After comparison** shows what changed between two tests, but cannot prove that a specific troubleshooting step caused the change.

---

## Technology Stack

| Component | Technology |
|---|---|
| Structure | HTML5 |
| Styling | CSS3 (custom properties, Grid, Flexbox) |
| Logic | Vanilla JavaScript (ES2020, no frameworks) |
| Charts | [Chart.js 4.4.1](https://www.chartjs.org/) via jsDelivr CDN |
| Speed test endpoint | [speed.cloudflare.com](https://speed.cloudflare.com) (public, CORS-enabled) |
| Local server | Python `http.server` module |
| Storage | Browser LocalStorage |

---

*CallReady · DCN Mini-Project · Network Performance Analysis*
