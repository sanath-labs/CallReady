/*
  CallReady – Phase 3 (visualization)
  Live download gauge, speed gauges, activity readiness visuals,
  health score comparison chart and a dashboard loading state.
  Reads only saved real results (LocalStorage) and live events from script.js.
*/
(function () {
  "use strict";

  const HISTORY_KEY = "callready.history.v1";
  const BASELINE_KEY = "callready.baseline.v1";
  const SCALE_STEPS = [10, 25, 50, 100, 250, 500, 1000];
  const COLOR = { good: "#14874a", average: "#b7710a", poor: "#c0392b", unknown: "#6b7584" };
  const TEXT = { good: "Good", average: "Average", poor: "Poor", unknown: "Not Available" };
  const RANK = { poor: 1, average: 2, good: 3 };
  const LINE = {
    good: "Suitable for this activity.",
    average: "Usable, but interruptions may happen.",
    poor: "May have significant problems.",
    unknown: "Run a test to see readiness."
  };

  const q = (sel) => document.querySelector(sel);

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (err) {
      return null;
    }
  }

  function latestRecord() {
    const list = readJSON(HISTORY_KEY);
    return Array.isArray(list) && list.length ? list[0] : null;
  }

  /* Smallest sensible scale that fits the value, so the ring is easy to read */
  function scaleFor(value) {
    for (const step of SCALE_STEPS) {
      if (value <= step * 0.9) return step;
    }
    return Math.ceil(value / 500) * 500;
  }

  /* Circular speed gauge. value null means "Not Available" and draws an empty ring. */
  function gaugeSvg(value, max, unit) {
    const radius = 54;
    const circ = 2 * Math.PI * radius;
    const fraction = value == null ? 0 : Math.min(value / max, 1);
    const shown = value == null ? "N/A" : value.toFixed(value < 10 ? 1 : 0);
    const label = value == null ? "Not available" : `${shown} ${unit}`;
    return `
      <svg class="speed-gauge" viewBox="0 0 140 140" role="img" aria-label="Speed gauge: ${esc(label)}">
        <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#e6eaf0" stroke-width="14"/>
        <circle cx="70" cy="70" r="${radius}" fill="none" stroke="${value == null ? "#b8c1cc" : "#1f6fd6"}" stroke-width="14"
          stroke-linecap="round" stroke-dasharray="${(fraction * circ).toFixed(1)} ${circ.toFixed(1)}"
          transform="rotate(-90 70 70)"/>
        <text x="70" y="72" text-anchor="middle" class="speed-value">${shown}</text>
        <text x="70" y="92" text-anchor="middle" class="speed-unit">${unit}</text>
      </svg>`;
  }

  /* ---------- Live download gauge (during a test) ---------- */
  function showLiveGauge(text) {
    q("#liveGauge").hidden = false;
    q("#liveGaugeBody").innerHTML = gaugeSvg(null, 100, "Mbps");
    q("#liveGaugeText").textContent = text;
  }

  function updateLiveGauge(mbps) {
    const max = scaleFor(mbps);
    q("#liveGaugeBody").innerHTML = gaugeSvg(mbps, max, "Mbps");
    q("#liveGaugeText").textContent = `Live download speed. Scale 0 to ${max} Mbps.`;
  }

  function hideLiveGauge() {
    q("#liveGauge").hidden = true;
  }

  /* ---------- Loading state ---------- */
  function setLoading(on) {
    const section = q("#dashboard");
    if (section) section.classList.toggle("is-loading", on);
    const note = q("#dashLoading");
    if (note) note.hidden = !on;
  }

  /* ---------- Speed gauges (download from latest test, upload not measured) ---------- */
  function renderSpeedGauges(latest) {
    const box = q("#speedGauges");
    if (!box) return;
    const download = latest && latest.connected !== false && latest.download != null ? latest.download : null;
    const max = scaleFor(download || 0);

    box.innerHTML = `
      <div class="card speed-card">
        <h3>Download speed</h3>
        <div class="speed-body">
          ${gaugeSvg(download, max, "Mbps")}
          <div>
            ${download == null
              ? `<p class="na">Not Available</p><p class="metric-sub">No download result in your latest test.</p>`
              : `<p class="metric-sub">From your latest test.</p>`}
            <p class="metric-sub">Scale 0 to ${max} Mbps</p>
          </div>
        </div>
      </div>
      <div class="card speed-card">
        <h3>Upload speed</h3>
        <div class="speed-body">
          ${gaugeSvg(null, 100, "Mbps")}
          <div>
            <p class="na">Not Available</p>
            <p class="metric-sub">Upload is not measured in this version, so it is not shown as a number.</p>
          </div>
        </div>
      </div>`;
  }

  /* ---------- Activity readiness visuals ---------- */
  function renderActivityVisuals(latest) {
    const box = q("#activityVisuals");
    if (!box) return;

    box.innerHTML = Object.keys(ACTIVITIES).map(key => {
      const a = ACTIVITIES[key];
      let status = "unknown";
      if (latest) {
        if (latest.connected === false) status = "poor";
        else if (latest.readiness && latest.readiness[key]) status = latest.readiness[key];
      }
      const rank = RANK[status] || 0;
      const segments = ["poor", "average", "good"].map((level, i) =>
        `<span class="av-seg ${i < rank ? "on-" + status : ""}"></span>`).join("");
      const limited = a.needsUpload && latest && latest.connected !== false
        ? `<p class="av-note">Upload is not measured, so confidence is limited.</p>`
        : "";

      return `
        <div class="card activity-visual">
          <div class="av-head">
            <span class="av-icon" aria-hidden="true">${a.icon}</span>
            <strong>${esc(a.name)}</strong>
            <span class="pill status-${status}">${TEXT[status]}</span>
          </div>
          <div class="av-bar" role="img" aria-label="${esc(a.name)}: ${TEXT[status]}">${segments}</div>
          <div class="av-labels"><span>Poor</span><span>Average</span><span>Good</span></div>
          <p class="metric-sub">${LINE[status]}</p>
          ${limited}
        </div>`;
    }).join("");
  }

  /* ---------- Health score before and after ---------- */
  function renderCompareScore() {
    const el = q("#chartCompareScore");
    if (!el || typeof Chart === "undefined") return;

    const existing = Chart.getChart(el);
    if (existing) existing.destroy();

    const base = readJSON(BASELINE_KEY);
    const latest = latestRecord();
    const card = el.parentElement.parentElement;
    let note = card.querySelector(".chart-empty");
    if (!note) {
      note = document.createElement("p");
      note.className = "chart-empty metric-sub";
      card.appendChild(note);
    }

    if (!base || !latest || base.id === latest.id) {
      el.hidden = true;
      note.hidden = false;
      note.textContent = "Save a Before test and run another test to compare scores.";
      return;
    }
    if (base.score == null || latest.score == null) {
      el.hidden = true;
      note.hidden = false;
      note.textContent = "A score is not available for one of the tests.";
      return;
    }

    note.hidden = true;
    el.hidden = false;
    new Chart(el.getContext("2d"), {
      type: "bar",
      data: {
        labels: ["Health score"],
        datasets: [
          { label: "Before", data: [base.score], backgroundColor: "#9aa7b8", borderRadius: 6 },
          { label: "After", data: [latest.score], backgroundColor: "#1f6fd6", borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: "Points (0 to 100)" } } }
      }
    });
  }

  /* ---------- Full refresh ---------- */
  function renderAll() {
    const latest = latestRecord();
    renderSpeedGauges(latest);
    renderActivityVisuals(latest);
    renderCompareScore();
  }

  function init() {
    document.addEventListener("callready:start", () => {
      setLoading(true);
      showLiveGauge("Testing your connection…");
    });

    document.addEventListener("callready:progress", (e) => {
      if (e.detail && typeof e.detail.mbps === "number") updateLiveGauge(e.detail.mbps);
    });

    // Phase 2 handles the results event first (it saves history). Phase 3 then reads the saved record.
    document.addEventListener("callready:results", () => {
      setTimeout(renderAll, 0);
    });

    document.addEventListener("callready:end", () => {
      setLoading(false);
      hideLiveGauge();
    });

    // The Before & After comparison changes on button clicks handled by Phase 2
    document.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("#compare, #history, #results")) {
        setTimeout(renderCompareScore, 0);
      }
    });

    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
