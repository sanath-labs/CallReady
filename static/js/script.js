/*
  CallReady – Phase 1
  Every number shown comes from a real measurement made in this browser.
  Nothing is hardcoded or simulated.
*/

/* ---------- Configuration ---------- */
const CONFIG = {
  // CORS-enabled public test endpoints. If your network blocks them, change these URLs.
  pingUrl: "https://speed.cloudflare.com/__down?bytes=0",
  downloadUrl: "https://speed.cloudflare.com/__down?bytes=10000000",
  downloadBytes: 10000000,   // must match the bytes= value above (about 10 MB)
  latencySamples: 8,         // number of response-time measurements
  pingTimeoutMs: 5000,
  downloadTimeoutMs: 30000
};

/*
  Readiness thresholds (documented and easy to change).
  download in Mbps, latency and jitter in ms.
  "good" and "average" are the minimum/maximum values for each tier:
  a result must meet ALL checks of a tier to receive that rating.
*/
const ACTIVITIES = {
  class: {
    name: "Online Classes",
    icon: "\u{1F4DA}",
    needsUpload: false,
    good:    { download: 5, latency: 150, jitter: 30 },
    average: { download: 2, latency: 250, jitter: 50 },
    advice: "Video lectures and screen sharing need steady download speed."
  },
  video: {
    name: "Video Calls",
    icon: "\u{1F3A5}",
    needsUpload: true,
    good:    { download: 8, latency: 120, jitter: 30 },
    average: { download: 3, latency: 200, jitter: 50 },
    advice: "Video calls also depend on upload speed, which is not measured in this version."
  },
  voice: {
    name: "Voice Calls",
    icon: "\u{1F4DE}",
    needsUpload: false,
    good:    { download: 1, latency: 150, jitter: 30 },
    average: { download: 0.5, latency: 250, jitter: 60 },
    advice: "Voice needs little bandwidth, but delay and jitter are very noticeable."
  },
  interview: {
    name: "Online Interviews",
    icon: "\u{1F4BC}",
    needsUpload: true,
    good:    { download: 5, latency: 120, jitter: 30 },
    average: { download: 2, latency: 200, jitter: 50 },
    advice: "Interviews need clear audio and video, so stability matters as much as speed."
  }
};

/* ---------- State ---------- */
let selectedActivity = null;
let lastResults = null;
let running = false;

/* ---------- Helpers ---------- */
const $ = (sel) => document.querySelector(sel);

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function mbps(bytes, seconds) {
  return seconds > 0 ? (bytes * 8) / seconds / 1000000 : 0;
}

/* Jitter: average of the differences between consecutive response times. */
function computeJitter(samples) {
  if (samples.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < samples.length; i++) {
    diffs.push(Math.abs(samples[i] - samples[i - 1]));
  }
  return mean(diffs);
}

function latencyLevel(ms) {
  if (ms == null) return null;
  if (ms <= 80) return "low";
  if (ms <= 150) return "moderate";
  return "high";
}

function jitterLevel(ms) {
  if (ms == null) return null;
  if (ms <= 15) return "stable";
  if (ms <= 30) return "slightly variable";
  return "unstable";
}

function statusLabel(status) {
  return { good: "Good", average: "Average", poor: "Poor", unknown: "Unknown" }[status];
}

/* fetch with a timeout and a cache-buster so the browser never serves a stored copy. */
async function timedFetch(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const separator = url.includes("?") ? "&" : "?";
  try {
    return await fetch(url + separator + "_=" + Date.now() + Math.random().toString(36).slice(2), {
      ...options,
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Measurements ---------- */

/* 1. Connectivity: can this browser reach the test server at all? */
async function checkConnectivity() {
  const started = performance.now();
  try {
    // no-cors lets us measure reachability without needing the response body.
    await timedFetch(CONFIG.pingUrl, { mode: "no-cors" }, CONFIG.pingTimeoutMs);
    return { connected: true, firstResponseMs: performance.now() - started };
  } catch (err) {
    const reason = err.name === "AbortError" ? "timeout" : "network";
    return { connected: false, reason };
  }
}

/* 2. Latency and jitter: repeated small requests, timed one by one. */
async function measureLatency(onProgress) {
  const samples = [];
  let failures = 0;

  for (let i = 0; i < CONFIG.latencySamples; i++) {
    const t0 = performance.now();
    try {
      await timedFetch(CONFIG.pingUrl, { mode: "no-cors" }, CONFIG.pingTimeoutMs);
      samples.push(performance.now() - t0);
    } catch (err) {
      failures++;
    }
    if (onProgress) onProgress(i + 1, CONFIG.latencySamples);
  }

  // The first request includes connection setup (DNS, TLS), so it is dropped when enough samples exist.
  const usable = samples.length > 3 ? samples.slice(1) : samples;
  if (usable.length === 0) {
    return { available: false, failures };
  }

  return {
    available: true,
    average: mean(usable),
    min: Math.min(...usable),
    max: Math.max(...usable),
    jitter: computeJitter(usable),
    samples: usable,
    failures,
    usedCount: usable.length
  };
}

/* 3. Download speed: read a known-size file and time it. */
async function measureDownload(onProgress) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.downloadTimeoutMs);
  const start = performance.now();

  try {
    const separator = CONFIG.downloadUrl.includes("?") ? "&" : "?";
    const response = await fetch(
      CONFIG.downloadUrl + separator + "_=" + Date.now(),
      { cache: "no-store", signal: controller.signal }
    );
    if (!response.ok) {
      return { available: false, reason: "http", status: response.status };
    }
    if (!response.body) {
      return { available: false, reason: "unsupported" };
    }

    const reader = response.body.getReader();
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      const seconds = (performance.now() - start) / 1000;
      if (onProgress) {
        onProgress(Math.min(received / CONFIG.downloadBytes, 1), mbps(received, seconds));
      }
    }

    const seconds = (performance.now() - start) / 1000;
    if (received === 0 || seconds <= 0) {
      return { available: false, reason: "empty" };
    }
    return { available: true, mbps: mbps(received, seconds), bytes: received, seconds };
  } catch (err) {
    const reason = err.name === "AbortError" ? "timeout" : "network";
    return { available: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Readiness assessment ---------- */

/*
  Uses only the measurements that exist. A missing measurement is not treated as a pass or a fail.
  Confidence drops to "limited" when measurements are missing or upload is not measured.
*/
function assessActivity(key, m) {
  const a = ACTIVITIES[key];
  const limitations = [];

  if (m.download == null) limitations.push("download speed could not be measured");
  if (m.jitter == null) limitations.push("jitter could not be calculated");
  if (a.needsUpload) limitations.push("upload speed is not measured yet");

  const meets = (tier) => {
    const checks = [];
    if (m.download != null) checks.push(m.download >= tier.download);
    if (m.latency != null) checks.push(m.latency <= tier.latency);
    if (m.jitter != null) checks.push(m.jitter <= tier.jitter);
    return checks.length > 0 && checks.every(Boolean);
  };

  let status;
  if (m.download == null && m.latency == null) {
    status = "unknown";
  } else if (meets(a.good)) {
    status = "good";
  } else if (meets(a.average)) {
    status = "average";
  } else {
    status = "poor";
  }

  const reasons = [];
  if (m.download != null) {
    reasons.push(m.download >= a.good.download
      ? `Download speed of ${m.download.toFixed(1)} Mbps is enough (at least ${a.good.download} Mbps is recommended).`
      : `Download speed of ${m.download.toFixed(1)} Mbps is below the ${a.good.download} Mbps recommended for a smooth experience.`);
  }
  if (m.latency != null) {
    reasons.push(m.latency <= a.good.latency
      ? `Response time of ${Math.round(m.latency)} ms is low enough (under ${a.good.latency} ms is recommended).`
      : `Response time of ${Math.round(m.latency)} ms is higher than the ${a.good.latency} ms recommended, which can cause delays.`);
  }
  if (m.jitter != null) {
    reasons.push(m.jitter <= a.good.jitter
      ? `Response times change by about ${Math.round(m.jitter)} ms between requests, which is steady enough.`
      : `Response times change by about ${Math.round(m.jitter)} ms between requests, which can cause voice or video to break up.`);
  }

  return {
    key,
    name: a.name,
    icon: a.icon,
    status,
    confidence: limitations.length === 0 ? "full" : "limited",
    limitations,
    reasons,
    advice: a.advice
  };
}

/* ---------- Problem tips (based on actual results) ---------- */
function buildTips(conn, lat, dl) {
  const tips = [];
  if (!conn.connected) {
    tips.push("Check that Wi-Fi or your cable is connected, then restart your router if the problem continues.");
    return tips;
  }
  if (lat.available && lat.average > 150) {
    tips.push("Response time is high. Move closer to your Wi-Fi router or try a wired connection.");
  }
  if (lat.available && lat.jitter != null && lat.jitter > 30) {
    tips.push("Response times are changing a lot. Check your Wi-Fi signal and pause large downloads or cloud backups.");
  }
  if (dl.available && dl.mbps < 5) {
    tips.push("Download speed is low. Disconnect unused devices and pause large downloads or updates.");
  }
  if (!dl.available) {
    tips.push("Download speed could not be measured. Try again, and close other apps that use the internet.");
  }
  if (tips.length === 0) {
    tips.push("No major problems were found. Keep other large downloads paused during your session.");
  }
  return tips;
}

/* ---------- UI helpers ---------- */
function showMessage(text) {
  const el = $("#testMessage");
  el.textContent = text;
  el.hidden = false;
}

function hideMessage() {
  $("#testMessage").hidden = true;
}

function setStep(text, percent) {
  $("#stepText").textContent = text;
  if (percent != null) $("#progressFill").style.width = percent + "%";
}

function setBusy(busy) {
  running = busy;
  $("#startBtn").disabled = busy;
  $("#heroStart").classList.toggle("disabled", busy);
  $("#progressWrap").hidden = !busy;
  if (busy) setStep("Preparing…", 0);
}

function gaugeSvg(value, max) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const fraction = value == null ? 0 : Math.min(value / max, 1);
  const shown = value == null ? "N/A" : value.toFixed(1);
  return `
    <svg class="gauge" viewBox="0 0 130 130" role="img" aria-label="Download speed gauge">
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="#d5dbe3" stroke-width="12"/>
      <circle cx="65" cy="65" r="${r}" fill="none" stroke="#1f6fd6" stroke-width="12"
        stroke-linecap="round" stroke-dasharray="${(fraction * c).toFixed(1)} ${c.toFixed(1)}"
        transform="rotate(-90 65 65)"/>
      <text x="65" y="63" text-anchor="middle" class="gauge-text">${shown}</text>
      <text x="65" y="81" text-anchor="middle" class="gauge-unit">Mbps</text>
    </svg>`;
}

function sparklineSvg(samples) {
  if (!samples || samples.length < 2) {
    return `<p class="metric-sub">Not enough samples to draw a chart.</p>`;
  }
  const w = 300, h = 90, pad = 8;
  const max = Math.max(...samples), min = Math.min(...samples);
  const span = max - min || 1;
  const points = samples.map((v, i) => {
    const x = pad + (i * (w - 2 * pad)) / (samples.length - 1);
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `
    <svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Response time chart">
      <polyline points="${points}" fill="none" stroke="#1f6fd6" stroke-width="2.5" stroke-linejoin="round"/>
      ${samples.map((v, i) => {
        const x = pad + (i * (w - 2 * pad)) / (samples.length - 1);
        const y = h - pad - ((v - min) / span) * (h - 2 * pad);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#1754a6"><title>${Math.round(v)} ms</title></circle>`;
      }).join("")}
    </svg>
    <p class="metric-sub">Each dot is one response-time measurement (oldest on the left).</p>`;
}

function statusPill(status) {
  return `<span class="pill status-${status}">${statusLabel(status)}</span>`;
}

/* ---------- Rendering ---------- */
function renderNoConnection(conn) {
  const reasonText = conn.reason === "timeout"
    ? "The test server did not respond in time."
    : "Your device could not reach the internet testing server.";

  $("#resultsEmpty").hidden = true;
  $("#resultsContent").hidden = false;
  $("#resultsContent").innerHTML = `
    <div class="card" style="border-left:6px solid var(--poor)">
      <h3>Connection: Disconnected ${statusPill("poor")}</h3>
      <p>${reasonText}</p>
      <ul>
        <li>Check that Wi-Fi or your cable is connected.</li>
        <li>Restart your router if the problem continues.</li>
        <li>Contact your internet provider if it still does not work.</li>
      </ul>
      <p class="method-note">Speed and latency tests were skipped because there is no connection to measure.</p>
      <div class="results-actions">
        <span></span>
        <button class="btn btn-primary" id="retryBtn">Retry test</button>
      </div>
    </div>`;
  $("#retryBtn").addEventListener("click", runTest);
}

function renderResults(r) {
  const { conn, lat, dl, assessments, tips } = r;

  const latAvail = lat.available;
  const latLevel = latAvail ? latencyLevel(lat.average) : null;
  const jitLevel = latAvail ? jitterLevel(lat.jitter) : null;

  const quality = [
    { label: "Connection", value: "Connected", status: "good", note: "Your device reached the internet test server." },
    {
      label: "Response time",
      value: latAvail ? capitalize(latLevel) : "Not Available",
      status: latAvail ? ({ low: "good", moderate: "average", high: "poor" }[latLevel]) : "unknown",
      note: latAvail ? `About ${Math.round(lat.average)} ms on average.` : "Response time could not be measured."
    },
    {
      label: "Stability",
      value: lat.jitter == null ? "Not Available" : capitalize(jitLevel),
      status: lat.jitter == null ? "unknown" : ({ stable: "good", "slightly variable": "average", unstable: "poor" }[jitLevel]),
      note: lat.jitter == null ? "Not enough measurements to judge stability." : `Average change of about ${Math.round(lat.jitter)} ms between responses.`
    }
  ];

  const qualityHtml = quality.map(q => `
    <div class="quality-item">
      <span class="label">${q.label}</span>
      <div>${q.value === "Not Available" ? `<span class="na">Not Available</span>` : `<strong>${q.value}</strong>`} ${statusPill(q.status)}</div>
      <p>${q.note}</p>
    </div>`).join("");

  const latencyCard = latAvail ? `
    <div class="card metric-card">
      <h3>Latency <span class="info" title="How long your internet takes to respond. Lower is better.">i</span></h3>
      <div class="metric-big">${Math.round(lat.average)} <span>ms average</span></div>
      <p class="metric-sub">Fastest ${Math.round(lat.min)} ms · Slowest ${Math.round(lat.max)} ms · ${lat.usedCount} measurements</p>
      <p class="metric-sub">Jitter: ${lat.jitter == null ? "Not Available" : Math.round(lat.jitter) + " ms"}
        <span class="info" title="How much your response time changes between requests. Steadier is better.">i</span></p>
      ${sparklineSvg(lat.samples)}
    </div>` : `
    <div class="card metric-card">
      <h3>Latency</h3>
      <p class="na">Not Available</p>
      <p class="metric-sub">Response times could not be measured.</p>
    </div>`;

  const downloadCard = `
    <div class="card metric-card">
      <h3>Download speed <span class="info" title="How quickly your device receives information, in Mbps.">i</span></h3>
      <div class="gauge-wrap">
        ${gaugeSvg(dl.available ? dl.mbps : null, 100)}
        <div>
          ${dl.available
            ? `<div class="metric-big" style="font-size:1.6rem">${dl.mbps.toFixed(1)} <span>Mbps</span></div>
               <p class="metric-sub">Downloaded ${(dl.bytes / 1000000).toFixed(1)} MB in ${dl.seconds.toFixed(1)} s.</p>`
            : `<p class="na">Not Available</p>
               <p class="metric-sub">${downloadFailText(dl)}</p>`}
        </div>
      </div>
    </div>`;

  const uploadCard = `
    <div class="card metric-card">
      <h3>Upload speed <span class="info" title="How quickly your device sends information. Matters for your camera and microphone.">i</span></h3>
      <p class="na">Not Available</p>
      <p class="metric-sub">Upload testing needs a dedicated upload server, which is not set up in this version.</p>
    </div>`;

  const packetCard = `
    <div class="card metric-card">
      <h3>Packet loss <span class="info" title="How much transmitted data fails to reach its destination.">i</span></h3>
      <p class="na">Not Available</p>
      <p class="metric-sub">A browser cannot measure packet loss reliably. It will be added in a later phase.</p>
    </div>`;

  const readinessHtml = assessments.map(a => `
    <div class="card readiness-card ${selectedActivity === a.key ? "is-selected" : ""}">
      <h3>${a.icon} ${a.name} ${statusPill(a.status)}</h3>
      ${selectedActivity === a.key ? `<p class="your-tag">Your selected activity</p>` : ""}
      <ul>${a.reasons.map(x => `<li>${x}</li>`).join("") || "<li>No measurements available.</li>"}</ul>
      ${a.confidence === "limited"
        ? `<p class="limited">Limited confidence: ${a.limitations.join("; ")}.</p>`
        : ""}
    </div>`).join("");

  const tipsHtml = tips.map(t => `<li>${t}</li>`).join("");

  $("#resultsEmpty").hidden = true;
  $("#resultsContent").hidden = false;
  $("#resultsContent").innerHTML = `
    <div class="quality-row">${qualityHtml}</div>

    <div class="results-grid">
      ${latencyCard}
      ${downloadCard}
      ${uploadCard}
      ${packetCard}
    </div>

    <h3 class="sub-heading">Readiness by activity</h3>
    <div class="readiness-grid">${readinessHtml}</div>

    <div class="card tips-card">
      <h3>What you can try</h3>
      <ul>${tipsHtml}</ul>
    </div>

    <div class="results-actions">
      <p class="method-note">Tested ${r.at.toLocaleString()}. Latency uses ${CONFIG.latencySamples} requests to a public test server. Download time is measured from about 10 MB.</p>
      <button class="btn btn-outline" id="retryBtn">Run test again</button>
    </div>`;

  $("#retryBtn").addEventListener("click", runTest);
}

function downloadFailText(dl) {
  switch (dl.reason) {
    case "timeout": return "The download took too long and was stopped. Try again on a steadier connection.";
    case "http": return `The test server returned an error (status ${dl.status}).`;
    case "empty": return "No data was received from the test server.";
    case "unsupported": return "This browser does not support the download measurement.";
    default: return "The download could not be completed. Check your connection and retry.";
  }
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ---------- Test flow ---------- */
async function runTest() {
  if (running) return;
  hideMessage();
  setBusy(true);
  document.dispatchEvent(new CustomEvent("callready:start"));

  try {
    setStep("Checking your internet connection…", 5);
    const conn = await checkConnectivity();

    if (!conn.connected) {
      renderNoConnection(conn);
      // Phase 2 hook: a failed connection is a real measured result
      lastResults = {
        conn, lat: { available: false }, dl: { available: false, reason: "skipped" },
        metrics: { download: null, latency: null, jitter: null },
        assessments: [], tips: [], at: new Date(), disconnected: true
      };
      document.dispatchEvent(new CustomEvent("callready:results", { detail: lastResults }));
      return;
    }

    setStep(`Measuring response time (0 of ${CONFIG.latencySamples})…`, 20);
    const lat = await measureLatency((done, total) => {
      setStep(`Measuring response time (${done} of ${total})…`, 20 + (done / total) * 35);
    });

    setStep("Measuring download speed…", 60);
    const dl = await measureDownload((fraction, currentMbps) => {
      setStep(`Measuring download speed… ${currentMbps.toFixed(1)} Mbps`, 60 + fraction * 38);
      document.dispatchEvent(new CustomEvent("callready:progress", { detail: { fraction, mbps: currentMbps } }));
    });

    const metrics = {
      download: dl.available ? dl.mbps : null,
      latency: lat.available ? lat.average : null,
      jitter: lat.available ? lat.jitter : null
    };

    const assessments = Object.keys(ACTIVITIES).map(key => assessActivity(key, metrics));
    const tips = buildTips(conn, lat, dl);

    lastResults = { conn, lat, dl, metrics, assessments, tips, at: new Date() };
    setStep("Test complete", 100);
    renderResults(lastResults);
    // Phase 2 hook: Phase 2 modules listen for this event
    document.dispatchEvent(new CustomEvent("callready:results", { detail: lastResults }));
    $("#results").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showMessage("Something went wrong during the test. Please try again.");
  } finally {
    setBusy(false);
    document.dispatchEvent(new CustomEvent("callready:end"));
  }
}

/* ---------- Event wiring ---------- */
function selectActivity(key) {
  selectedActivity = key;
  document.querySelectorAll(".activity-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.activity === key);
  });
  $("#selectedActivityLabel").textContent = key
    ? `${ACTIVITIES[key].icon} ${ACTIVITIES[key].name}`
    : "None selected (all activities will be assessed)";
}

document.querySelectorAll(".activity-card").forEach(card => {
  card.addEventListener("click", () => {
    const key = card.dataset.activity;
    selectActivity(selectedActivity === key ? null : key);
    $("#test").scrollIntoView({ behavior: "smooth" });
  });
});

$("#startBtn").addEventListener("click", runTest);

$("#heroStart").addEventListener("click", (e) => {
  e.preventDefault();
  document.getElementById("test").scrollIntoView({ behavior: "smooth" });
  runTest();
});

$("#navToggle").addEventListener("click", () => {
  $("#navLinks").classList.toggle("open");
});

document.querySelectorAll("#navLinks a").forEach(link => {
  link.addEventListener("click", () => $("#navLinks").classList.remove("open"));
});
