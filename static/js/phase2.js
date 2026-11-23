/*
  CallReady – Phase 2
  Health score, problem finder, Chart.js dashboard, before/after comparison,
  connection history (LocalStorage) and meeting preparation checklist.
  Listens for custom events dispatched by script.js (Phase 1).
*/

/* ---------- Score configuration ---------- */
const SCORE = {
  weights: { download: 0.4, latency: 0.3, jitter: 0.3 },
  /* For each metric a "perfect" and "zero" anchor.
     Linear interpolation between them gives a 0–100 sub-score. */
  download: { perfect: 50, zero: 0 },   // Mbps
  latency:  { perfect: 20, zero: 500 },  // ms (lower is better)
  jitter:   { perfect: 0,  zero: 150 },  // ms (lower is better)
  bands: { good: 80, average: 50 }       // score >= 80 → Good, >= 50 → Average
};

const SAME = { mbps: 0.5, ms: 5, score: 3 }; // thresholds for "about the same"

const HISTORY_KEY = "callready.history.v1";
const BEFORE_KEY  = "callready.baseline.v1";
const MAX_HISTORY = 50;

/* ---------- Helpers (reuse Phase 1's $ if present) ---------- */
const p2$ = (sel) => document.querySelector(sel);

/* ---------- Health score ---------- */
function computeScore(m) {
  const parts = [];
  let totalWeight = 0;

  function sub(value, perfect, zero) {
    if (value == null) return null;
    const range = perfect - zero;
    if (range === 0) return 100;
    return Math.max(0, Math.min(100, ((value - zero) / range) * 100));
  }

  const dl = sub(m.download, SCORE.download.perfect, SCORE.download.zero);
  const lt = sub(m.latency,  SCORE.latency.perfect,  SCORE.latency.zero);
  const jt = sub(m.jitter,   SCORE.jitter.perfect,   SCORE.jitter.zero);

  if (dl != null) { parts.push({ name: "Download", sub: dl, w: SCORE.weights.download }); totalWeight += SCORE.weights.download; }
  if (lt != null) { parts.push({ name: "Latency",  sub: lt, w: SCORE.weights.latency  }); totalWeight += SCORE.weights.latency;  }
  if (jt != null) { parts.push({ name: "Jitter",   sub: jt, w: SCORE.weights.jitter   }); totalWeight += SCORE.weights.jitter;   }

  if (totalWeight === 0) return { score: null, band: "unknown", parts: [], excluded: ["download", "latency", "jitter"] };

  let score = 0;
  const excluded = [];
  parts.forEach(p => { score += p.sub * (p.w / totalWeight); });
  score = Math.round(Math.max(0, Math.min(100, score)));

  if (dl == null) excluded.push("download speed");
  if (lt == null) excluded.push("response time");
  if (jt == null) excluded.push("jitter");

  const band = score >= SCORE.bands.good ? "good" : score >= SCORE.bands.average ? "average" : "poor";
  return { score, band, parts, excluded };
}

function scoreBand(score) {
  if (score == null) return "unknown";
  if (score >= SCORE.bands.good) return "good";
  if (score >= SCORE.bands.average) return "average";
  return "poor";
}

/* ---------- Score ring SVG ---------- */
function scoreRingSvg(score) {
  const r = 60, c = 2 * Math.PI * r;
  const fraction = score == null ? 0 : score / 100;
  const color = score == null ? "#6b7584" : score >= 80 ? "#14874a" : score >= 50 ? "#b7710a" : "#c0392b";
  const label = score == null ? "N/A" : score;
  return `
    <svg class="score-ring" viewBox="0 0 150 150" role="img" aria-label="Health score">
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="#d5dbe3" stroke-width="14"/>
      <circle cx="75" cy="75" r="${r}" fill="none" stroke="${color}" stroke-width="14"
        stroke-linecap="round" stroke-dasharray="${(fraction * c).toFixed(1)} ${c.toFixed(1)}"
        transform="rotate(-90 75 75)"/>
      <text x="75" y="72" text-anchor="middle" class="score-number">${label}</text>
      <text x="75" y="92" text-anchor="middle" class="score-of">/ 100</text>
    </svg>`;
}

/* ---------- Problem finder ---------- */
function findProblems(m, conn) {
  const problems = [];

  if (conn && !conn.connected) {
    problems.push({
      severity: "high", title: "No internet connection",
      text: "Your device could not reach the test server.",
      steps: ["Check that Wi-Fi or your cable is connected.", "Restart your router.", "Contact your internet provider if it still does not work."]
    });
    return problems;
  }

  if (m.download != null && m.download < 2) {
    problems.push({
      severity: "high", title: "Very slow download speed",
      text: `Download speed is ${m.download.toFixed(1)} Mbps, which is below 2 Mbps.`,
      steps: ["Disconnect other devices from Wi-Fi.", "Pause large downloads, cloud backups and updates.", "Move closer to your router or use a wired connection.", "Try again at a different time — your connection may be shared with many users."]
    });
  } else if (m.download != null && m.download < 5) {
    problems.push({
      severity: "medium", title: "Low download speed",
      text: `Download speed is ${m.download.toFixed(1)} Mbps, which may not be enough for video.`,
      steps: ["Close unused browser tabs and apps.", "Pause large downloads or updates.", "Move closer to your router."]
    });
  }

  if (m.latency != null && m.latency > 250) {
    problems.push({
      severity: "high", title: "Very high response time",
      text: `Average response time is ${Math.round(m.latency)} ms, well above 250 ms.`,
      steps: ["Use a wired connection instead of Wi-Fi if possible.", "Move closer to your router.", "Close background apps that use the internet.", "Try a different DNS server (such as 8.8.8.8 or 1.1.1.1)."]
    });
  } else if (m.latency != null && m.latency > 150) {
    problems.push({
      severity: "medium", title: "High response time",
      text: `Average response time is ${Math.round(m.latency)} ms, above the 150 ms recommended for live calls.`,
      steps: ["Move closer to your router or use a wired connection.", "Close other apps that use the internet."]
    });
  }

  if (m.jitter != null && m.jitter > 50) {
    problems.push({
      severity: "high", title: "Unstable connection",
      text: `Response times change by about ${Math.round(m.jitter)} ms between requests.`,
      steps: ["Check your Wi-Fi signal strength.", "Pause large downloads or cloud backups.", "Avoid using the microwave near your router.", "Try a wired connection."]
    });
  } else if (m.jitter != null && m.jitter > 30) {
    problems.push({
      severity: "medium", title: "Slightly unstable connection",
      text: `Response times change by about ${Math.round(m.jitter)} ms between requests, which can cause short freezes.`,
      steps: ["Check your Wi-Fi signal.", "Pause background downloads."]
    });
  }

  // Always note upload limitation
  problems.push({
    severity: "info", title: "Upload speed is not measured",
    text: "Upload speed matters for your camera and microphone but cannot be tested in this version.",
    steps: ["If video calls freeze for other people but not for you, your upload may be low.", "Use your internet provider's speed test to check upload speed."]
  });

  return problems;
}

/* ---------- Render Phase 2 results ---------- */
function renderP2Results(r) {
  const { metrics, conn } = r;
  const sc = computeScore(metrics);
  const problems = findProblems(metrics, conn);

  // Score card
  const formulaItems = sc.parts.map(p =>
    `<li>${p.name}: ${p.sub.toFixed(0)} / 100 × ${(p.w * 100).toFixed(0)}%</li>`
  ).join("");

  const excludedHtml = sc.excluded.length > 0
    ? `<p class="excluded">${sc.excluded.join(", ")} not measured — excluded from the score.</p>`
    : "";

  p2$("#p2ScoreCard").innerHTML = `
    <div class="p2-card-title">
      <h3>Network Health Score</h3>
      ${sc.score != null ? statusPill(sc.band) : ""}
    </div>
    <div class="score-wrap">
      ${scoreRingSvg(sc.score)}
      <div class="score-text">
        <p><strong>${sc.score != null ? sc.score + " / 100" : "Not available"}</strong></p>
        <p>How the score is calculated:</p>
        <ul class="formula-list">
          <li>Download speed (${(SCORE.weights.download * 100).toFixed(0)}%)</li>
          <li>Response time (${(SCORE.weights.latency * 100).toFixed(0)}%)</li>
          <li>Jitter (${(SCORE.weights.jitter * 100).toFixed(0)}%)</li>
          ${formulaItems}
        </ul>
        ${excludedHtml}
      </div>
    </div>`;

  // Problem card
  if (problems.length === 0 || (problems.length === 1 && problems[0].severity === "info")) {
    const infoHtml = problems.length === 1 ? renderProblemItem(problems[0]) : "";
    p2$("#p2ProblemCard").innerHTML = `
      <h3>Network Problem Finder</h3>
      <p class="no-problem">✓ No major problems found with your connection.</p>
      ${infoHtml}
      <p class="problem-note">This check is based on the measurements taken. It cannot detect every possible problem.</p>`;
  } else {
    p2$("#p2ProblemCard").innerHTML = `
      <h3>Network Problem Finder</h3>
      <ul class="problem-list">${problems.map(renderProblemItem).join("")}</ul>
      <p class="problem-note">These findings are based on the measurements taken. CallReady cannot prove the exact cause — use these suggestions as starting points.</p>`;
  }

  // Note
  p2$("#p2Note").textContent = `Health score: ${sc.score != null ? sc.score + " / 100" : "N/A"}. Tested ${r.at.toLocaleString()}.`;

  p2$("#p2Results").hidden = false;

  // Save to history
  saveHistory(r, sc);

  // Update dashboard charts
  updateDashboard(r, sc);

  // Update comparison if "Before" exists
  updateComparison(r, sc);

  // Update checklist internet items
  updateChecklistFromResults(r, sc);
}

function renderProblemItem(p) {
  return `
    <li class="problem-item sev-${p.severity}">
      <h4>${p.title} ${p.severity !== "info" ? statusPill(p.severity === "high" ? "poor" : "average") : ""}</h4>
      <p>${p.text}</p>
      ${p.steps.length > 0 ? `<ul>${p.steps.map(s => `<li>${s}</li>`).join("")}</ul>` : ""}
    </li>`;
}

/* ---------- LocalStorage history ---------- */
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch { return []; }
}

function saveHistory(r, sc) {
  try {
    const history = loadHistory();
    // Build readiness map for phase3 visuals
    const readiness = {};
    if (r.assessments) {
      r.assessments.forEach(a => { readiness[a.key] = a.status; });
    }
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: r.at.toISOString(),
      activity: typeof selectedActivity !== "undefined" ? selectedActivity : null,
      download: r.metrics.download,
      latency: r.metrics.latency,
      jitter: r.metrics.jitter,
      score: sc.score,
      band: sc.band,
      connected: r.conn ? r.conn.connected : true,
      readiness: readiness,
      disconnected: !!r.disconnected
    };
    // Store newest first (phase3 reads list[0] as latest)
    history.unshift(entry);
    // Keep only the most recent MAX_HISTORY entries
    while (history.length > MAX_HISTORY) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  } catch (e) {
    console.warn("CallReady: could not save history", e);
  }
}

function deleteHistoryEntry(id) {
  try {
    let history = loadHistory();
    history = history.filter(h => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    // If deleted entry was the "Before", clear it
    const before = loadBefore();
    if (before && before.id === id) {
      localStorage.removeItem(BEFORE_KEY);
      renderComparison();
    }
    renderHistory();
  } catch (e) {
    console.warn("CallReady: could not delete history entry", e);
  }
}

function clearHistory() {
  if (!confirm("Clear all saved test history? This cannot be undone.")) return;
  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(BEFORE_KEY);
    renderHistory();
    renderComparison();
  } catch (e) {
    console.warn("CallReady: could not clear history", e);
  }
}

function setBeforeFromHistory(id) {
  const history = loadHistory();
  const entry = history.find(h => h.id === id);
  if (entry) {
    localStorage.setItem(BEFORE_KEY, JSON.stringify(entry));
    renderHistory();
    renderComparison();
  }
}

function loadBefore() {
  try {
    return JSON.parse(localStorage.getItem(BEFORE_KEY));
  } catch { return null; }
}

function renderHistory() {
  const history = loadHistory();
  const before = loadBefore();
  const tbody = p2$("#historyBody");
  const empty = p2$("#historyEmpty");
  const count = p2$("#historyCount");

  if (history.length === 0) {
    empty.hidden = false;
    tbody.innerHTML = "";
    count.textContent = "No saved tests.";
    return;
  }

  empty.hidden = true;
  count.textContent = `${history.length} saved test${history.length !== 1 ? "s" : ""}.`;

  tbody.innerHTML = history.map(h => {
    const isBefore = before && before.id === h.id;
    const actName = h.activity && typeof ACTIVITIES !== "undefined" && ACTIVITIES[h.activity]
      ? ACTIVITIES[h.activity].name : "All";
    const date = new Date(h.at);
    return `
      <tr class="${isBefore ? "is-before" : ""}">
        <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
        <td>${actName}</td>
        <td>${h.download != null ? h.download.toFixed(1) + " Mbps" : "N/A"}</td>
        <td>${h.latency != null ? Math.round(h.latency) + " ms" : "N/A"}</td>
        <td>${h.jitter != null ? Math.round(h.jitter) + " ms" : "N/A"}</td>
        <td>${h.score != null ? h.score : "N/A"}</td>
        <td>${h.band ? statusPill(h.band) : ""}</td>
        <td>
          <button class="small-btn before-btn" onclick="setBeforeFromHistory('${h.id}')" title="Use as Before test">${isBefore ? "✓ Before" : "Set Before"}</button>
          <button class="small-btn" onclick="deleteHistoryEntry('${h.id}')" title="Delete this test">Delete</button>
        </td>
      </tr>`;
  }).join("");
}

/* ---------- Before & After comparison ---------- */
function updateComparison(r, sc) {
  const before = loadBefore();
  if (!before) return;
  renderComparison(r, sc);
}

function renderComparison(afterResults, afterSc) {
  const before = loadBefore();
  const card = p2$("#compareCard");
  const emptyEl = p2$("#compareEmpty");
  const chartsEl = p2$("#compareCharts");

  if (!before) {
    if (emptyEl) emptyEl.hidden = false;
    card.innerHTML = `<p class="empty-state" id="compareEmpty">No "Before" test saved yet.</p>`;
    if (chartsEl) chartsEl.hidden = true;
    return;
  }

  // Use latest results or last history entry as "After"
  let after;
  if (afterResults) {
    after = {
      download: afterResults.metrics.download,
      latency: afterResults.metrics.latency,
      jitter: afterResults.metrics.jitter,
      score: afterSc ? afterSc.score : null,
      at: afterResults.at.toISOString()
    };
  } else {
    const history = loadHistory();
    if (history.length === 0) {
      card.innerHTML = `<p class="empty-state">"Before" test saved. Run another test to see the comparison.</p>`;
      if (chartsEl) chartsEl.hidden = true;
      return;
    }
    const last = history[0];
    if (last.id === before.id) {
      card.innerHTML = `<p class="empty-state">"Before" test saved. Run another test to see the comparison.</p>`;
      if (chartsEl) chartsEl.hidden = true;
      return;
    }
    after = last;
  }

  function delta(bVal, aVal, unit, higherIsBetter) {
    if (bVal == null || aVal == null) return { text: "N/A", cls: "delta-same" };
    const diff = aVal - bVal;
    const absDiff = Math.abs(diff);
    const threshold = unit === "Mbps" ? SAME.mbps : unit === "ms" ? SAME.ms : SAME.score;
    if (absDiff <= threshold) return { text: "About the same", cls: "delta-same" };
    const better = higherIsBetter ? diff > 0 : diff < 0;
    const arrow = diff > 0 ? "↑" : "↓";
    const label = `${arrow} ${absDiff.toFixed(unit === "Mbps" ? 1 : 0)} ${unit}`;
    return { text: label, cls: better ? "delta-up" : "delta-down" };
  }

  const rows = [
    { label: "Download speed", bVal: before.download, aVal: after.download, unit: "Mbps", fmt: v => v != null ? v.toFixed(1) + " Mbps" : "N/A", higher: true },
    { label: "Response time", bVal: before.latency, aVal: after.latency, unit: "ms", fmt: v => v != null ? Math.round(v) + " ms" : "N/A", higher: false },
    { label: "Jitter", bVal: before.jitter, aVal: after.jitter, unit: "ms", fmt: v => v != null ? Math.round(v) + " ms" : "N/A", higher: false },
    { label: "Health score", bVal: before.score, aVal: after.score, unit: "", fmt: v => v != null ? v + " / 100" : "N/A", higher: true }
  ];

  const tableRows = rows.map(r => {
    const d = delta(r.bVal, r.aVal, r.unit, r.higher);
    return `<tr>
      <td>${r.label}</td>
      <td class="num">${r.fmt(r.bVal)}</td>
      <td class="num">${r.fmt(r.aVal)}</td>
      <td class="num ${d.cls}">${d.text}</td>
    </tr>`;
  }).join("");

  // Build verdict
  let improved = 0, worsened = 0;
  rows.forEach(r => {
    const d = delta(r.bVal, r.aVal, r.unit, r.higher);
    if (d.cls === "delta-up") improved++;
    if (d.cls === "delta-down") worsened++;
  });

  let verdict;
  if (improved > worsened) verdict = "Your connection improved after the changes.";
  else if (worsened > improved) verdict = "Your connection got worse. Try reverting your changes.";
  else verdict = "Results are mixed or about the same.";

  const beforeDate = new Date(before.at);
  const afterDate = new Date(after.at);

  card.innerHTML = `
    <div class="table-scroll">
      <table class="compare-table">
        <thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Change</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="compare-verdict">
      <p><strong>${verdict}</strong></p>
      <p class="metric-sub">Before: ${beforeDate.toLocaleString()} · After: ${afterDate.toLocaleString()}</p>
    </div>
    <div class="compare-actions">
      <button class="btn btn-outline" onclick="localStorage.removeItem('callready.baseline.v1'); renderComparison(); renderHistory();">Clear "Before" test</button>
    </div>`;

  // Comparison charts
  if (chartsEl && typeof Chart !== "undefined") {
    chartsEl.hidden = false;
    renderCompareCharts(before, after);
  }
}

/* ---------- Dashboard charts ---------- */
let chartLatency, chartJitter, chartDownloadHist, chartScoreRing;

function updateDashboard(r, sc) {
  const dashEmpty = p2$("#dashEmpty");
  const dashContent = p2$("#dashContent");

  if (!dashEmpty || !dashContent) return;
  dashEmpty.hidden = true;
  dashContent.hidden = false;

  if (typeof Chart === "undefined") {
    const warn = p2$("#chartUnavailable");
    if (warn) warn.hidden = false;
    return;
  }

  // Latency chart
  if (r.lat && r.lat.available && r.lat.samples) {
    const ctx = p2$("#chartLatency");
    if (ctx) {
      if (chartLatency) chartLatency.destroy();
      chartLatency = new Chart(ctx, {
        type: "line",
        data: {
          labels: r.lat.samples.map((_, i) => `#${i + 1}`),
          datasets: [{
            label: "Response time (ms)",
            data: r.lat.samples.map(v => Math.round(v)),
            borderColor: "#1f6fd6",
            backgroundColor: "rgba(31,111,214,0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#1754a6"
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, title: { display: true, text: "ms" } } }
        }
      });
    }
  }

  // Jitter chart
  if (r.lat && r.lat.available && r.lat.samples && r.lat.samples.length >= 2) {
    const diffs = [];
    for (let i = 1; i < r.lat.samples.length; i++) {
      diffs.push(Math.abs(r.lat.samples[i] - r.lat.samples[i - 1]));
    }
    const ctx = p2$("#chartJitter");
    if (ctx) {
      if (chartJitter) chartJitter.destroy();
      chartJitter = new Chart(ctx, {
        type: "bar",
        data: {
          labels: diffs.map((_, i) => `${i + 1}→${i + 2}`),
          datasets: [{
            label: "Jitter (ms)",
            data: diffs.map(v => Math.round(v)),
            backgroundColor: diffs.map(v => v > 30 ? "#c0392b" : v > 15 ? "#b7710a" : "#14874a"),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, title: { display: true, text: "ms" } } }
        }
      });
    }
  }

  // Download speed history
  const history = loadHistory().filter(h => h.download != null);
  if (history.length > 0) {
    const ctx = p2$("#chartDownloadHistory");
    if (ctx) {
      if (chartDownloadHist) chartDownloadHist.destroy();
      chartDownloadHist = new Chart(ctx, {
        type: "line",
        data: {
          labels: history.map(h => {
            const d = new Date(h.at);
            return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          }),
          datasets: [{
            label: "Download (Mbps)",
            data: history.map(h => parseFloat(h.download.toFixed(1))),
            borderColor: "#1f6fd6",
            backgroundColor: "rgba(31,111,214,0.08)",
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#1754a6"
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, title: { display: true, text: "Mbps" } } }
        }
      });
    }
  }

  // Health score doughnut
  if (sc.score != null) {
    const ctx = p2$("#chartScore");
    if (ctx) {
      if (chartScoreRing) chartScoreRing.destroy();
      const color = sc.score >= 80 ? "#14874a" : sc.score >= 50 ? "#b7710a" : "#c0392b";
      chartScoreRing = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: ["Score", "Remaining"],
          datasets: [{
            data: [sc.score, 100 - sc.score],
            backgroundColor: [color, "#d5dbe3"],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          cutout: "72%",
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          }
        }
      });
      const textEl = p2$("#scoreChartText");
      if (textEl) textEl.textContent = `${sc.score} / 100 — ${sc.band.charAt(0).toUpperCase() + sc.band.slice(1)}`;
    }
  }
}

/* ---------- Comparison charts ---------- */
let chartCompSpeed, chartCompLatency, chartCompScore;

function renderCompareCharts(before, after) {
  if (typeof Chart === "undefined") return;

  // Speed comparison
  const ctx1 = p2$("#chartCompareSpeed");
  if (ctx1) {
    if (chartCompSpeed) chartCompSpeed.destroy();
    chartCompSpeed = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: ["Download speed"],
        datasets: [
          { label: "Before", data: [before.download != null ? parseFloat(before.download.toFixed(1)) : 0], backgroundColor: "#b7710a", borderRadius: 6 },
          { label: "After", data: [after.download != null ? parseFloat(after.download.toFixed(1)) : 0], backgroundColor: "#1f6fd6", borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, title: { display: true, text: "Mbps" } } }
      }
    });
  }

  // Latency and jitter comparison
  const ctx2 = p2$("#chartCompareLatency");
  if (ctx2) {
    if (chartCompLatency) chartCompLatency.destroy();
    chartCompLatency = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: ["Latency", "Jitter"],
        datasets: [
          { label: "Before", data: [before.latency != null ? Math.round(before.latency) : 0, before.jitter != null ? Math.round(before.jitter) : 0], backgroundColor: "#b7710a", borderRadius: 6 },
          { label: "After", data: [after.latency != null ? Math.round(after.latency) : 0, after.jitter != null ? Math.round(after.jitter) : 0], backgroundColor: "#1f6fd6", borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, title: { display: true, text: "ms" } } }
      }
    });
  }

  // Score comparison
  const ctx3 = p2$("#chartCompareScore");
  if (ctx3) {
    if (chartCompScore) chartCompScore.destroy();
    chartCompScore = new Chart(ctx3, {
      type: "bar",
      data: {
        labels: ["Health Score"],
        datasets: [
          { label: "Before", data: [before.score != null ? before.score : 0], backgroundColor: "#b7710a", borderRadius: 6 },
          { label: "After", data: [after.score != null ? after.score : 0], backgroundColor: "#1f6fd6", borderRadius: 6 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: "Score" } } }
      }
    });
  }
}

/* ---------- Meeting preparation checklist ---------- */
const CHECKLIST_ITEMS = [
  { id: "ck-internet", label: "Internet connection", detail: "Your device can reach the internet.", auto: true },
  { id: "ck-readiness", label: "Network readiness", detail: "Your connection is good enough for a call.", auto: true },
  { id: "ck-mic", label: "Microphone", detail: "Your browser can access a microphone.", auto: false },
  { id: "ck-cam", label: "Camera", detail: "Your browser can access a camera.", auto: false }
];

const BROWSER_CHECKS = [
  { label: "WebRTC", check: () => !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection) },
  { label: "MediaDevices API", check: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) },
  { label: "LocalStorage", check: () => { try { localStorage.setItem("_cr_test", "1"); localStorage.removeItem("_cr_test"); return true; } catch { return false; } } },
  { label: "Fetch API", check: () => typeof fetch === "function" },
  { label: "Performance API", check: () => typeof performance !== "undefined" && typeof performance.now === "function" }
];

let checkState = {};

function initChecklist() {
  CHECKLIST_ITEMS.forEach(item => {
    checkState[item.id] = { status: "todo", note: "" };
  });
  renderChecklist();
  renderBrowserChecks();
}

function renderChecklist() {
  const list = p2$("#checkList");
  if (!list) return;

  list.innerHTML = CHECKLIST_ITEMS.map(item => {
    const s = checkState[item.id];
    const iconCls = s.status === "ok" ? "ok" : s.status === "warn" ? "warn" : s.status === "bad" ? "bad" : "todo";
    const icon = s.status === "ok" ? "✓" : s.status === "warn" ? "!" : s.status === "bad" ? "✗" : "?";
    return `
      <li class="check-item">
        <span class="check-icon ${iconCls}">${icon}</span>
        <div>
          <strong>${item.label}</strong>
          <small>${item.detail}</small>
          ${s.note ? `<div class="fix">${s.note}</div>` : ""}
        </div>
      </li>`;
  }).join("");

  // Final summary
  const final = p2$("#checkFinal");
  if (!final) return;
  const allChecked = CHECKLIST_ITEMS.every(item => checkState[item.id].status !== "todo");
  const allOk = CHECKLIST_ITEMS.every(item => checkState[item.id].status === "ok");

  if (allChecked) {
    final.hidden = false;
    if (allOk) {
      final.className = "check-final done";
      final.textContent = "✓ Your meeting preparation checklist is complete.";
    } else {
      final.className = "check-final pending";
      final.textContent = "Some items need attention. Review the warnings above.";
    }
  } else {
    final.hidden = true;
  }
}

function renderBrowserChecks() {
  const list = p2$("#browserList");
  if (!list) return;

  list.innerHTML = BROWSER_CHECKS.map(item => {
    const supported = item.check();
    return `
      <li class="check-item">
        <span class="check-icon ${supported ? "ok" : "warn"}">${supported ? "✓" : "!"}</span>
        <div>
          <strong>${item.label}</strong>
          <span class="val">${supported ? "Supported" : "Not supported"}</span>
        </div>
      </li>`;
  }).join("");
}

function updateChecklistFromResults(r, sc) {
  // Internet connection
  if (r.conn && r.conn.connected) {
    checkState["ck-internet"] = { status: "ok", note: "Connected to the internet." };
  } else {
    checkState["ck-internet"] = { status: "bad", note: "Could not reach the internet. Check your connection." };
  }

  // Network readiness
  if (sc.score != null) {
    if (sc.score >= SCORE.bands.good) {
      checkState["ck-readiness"] = { status: "ok", note: `Health score: ${sc.score} / 100 (Good).` };
    } else if (sc.score >= SCORE.bands.average) {
      checkState["ck-readiness"] = { status: "warn", note: `Health score: ${sc.score} / 100 (Average). Your call may have some issues.` };
    } else {
      checkState["ck-readiness"] = { status: "bad", note: `Health score: ${sc.score} / 100 (Poor). Try the tips in the Problem Finder.` };
    }
  } else {
    checkState["ck-readiness"] = { status: "warn", note: "Could not calculate a score from the available measurements." };
  }

  renderChecklist();
}

async function checkMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());
    checkState["ck-mic"] = { status: "ok", note: "Microphone is available." };
  } catch (e) {
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      checkState["ck-mic"] = { status: "bad", note: "Microphone permission denied. Click the lock icon in the address bar to allow it." };
    } else if (e.name === "NotFoundError") {
      checkState["ck-mic"] = { status: "bad", note: "No microphone found. Connect a microphone and try again." };
    } else {
      checkState["ck-mic"] = { status: "warn", note: `Microphone check failed: ${e.message}` };
    }
  }
  renderChecklist();
}

async function checkCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach(t => t.stop());
    checkState["ck-cam"] = { status: "ok", note: "Camera is available." };
  } catch (e) {
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      checkState["ck-cam"] = { status: "bad", note: "Camera permission denied. Click the lock icon in the address bar to allow it." };
    } else if (e.name === "NotFoundError") {
      checkState["ck-cam"] = { status: "bad", note: "No camera found. Connect a camera and try again." };
    } else {
      checkState["ck-cam"] = { status: "warn", note: `Camera check failed: ${e.message}` };
    }
  }
  renderChecklist();
}

async function runAllChecks() {
  // Internet and readiness are updated from test results (if available)
  if (lastResults) {
    const sc = computeScore(lastResults.metrics);
    updateChecklistFromResults(lastResults, sc);
  } else {
    // Quick connectivity check
    try {
      const resp = await fetch("https://speed.cloudflare.com/__down?bytes=0", { mode: "no-cors", cache: "no-store" });
      checkState["ck-internet"] = { status: "ok", note: "Connected to the internet." };
    } catch {
      checkState["ck-internet"] = { status: "bad", note: "Could not reach the internet." };
    }
    checkState["ck-readiness"] = { status: "warn", note: "Run a network test first to check readiness." };
  }
  await checkMicrophone();
  await checkCamera();
  renderChecklist();
}

/* ---------- "Save as Before" button ---------- */
function saveCurrentAsBefore() {
  const history = loadHistory();
  if (history.length === 0) return;
  const last = history[history.length - 1];
  localStorage.setItem(BEFORE_KEY, JSON.stringify(last));
  renderHistory();
  renderComparison();
}

/* ---------- Event wiring ---------- */
document.addEventListener("callready:results", (e) => {
  renderP2Results(e.detail);
});

// Set Before button
const btnBefore = p2$("#btnSetBefore");
if (btnBefore) btnBefore.addEventListener("click", saveCurrentAsBefore);

// Clear history button
const btnClear = p2$("#btnClearHistory");
if (btnClear) btnClear.addEventListener("click", clearHistory);

// Checklist buttons
const btnMic = p2$("#btnCheckMic");
if (btnMic) btnMic.addEventListener("click", checkMicrophone);

const btnCam = p2$("#btnCheckCam");
if (btnCam) btnCam.addEventListener("click", checkCamera);

const btnAll = p2$("#btnCheckAll");
if (btnAll) btnAll.addEventListener("click", runAllChecks);

/* ---------- Init ---------- */
initChecklist();
renderHistory();
renderComparison();
