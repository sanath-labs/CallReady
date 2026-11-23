/*
  CallReady – Report builder (Phase 2)
  Generates a downloadable HTML report and handles Print / Save as PDF.
  Uses only real measurements — nothing is hardcoded.
*/

/* ---------- Build report HTML ---------- */
function buildReportHtml() {
  if (typeof lastResults === "undefined" || !lastResults) return null;

  const r = lastResults;
  const m = r.metrics;
  const date = r.at.toLocaleString();

  // Compute score
  const sc = typeof computeScore === "function" ? computeScore(m) : { score: null, band: "unknown", parts: [], excluded: [] };

  // Assessments
  const assessments = r.assessments || [];

  // Problems
  const problems = typeof findProblems === "function" ? findProblems(m, r.conn) : [];

  // Tips
  const tips = r.tips || [];

  function naOrVal(val, unit, decimals) {
    if (val == null) return '<span class="na">Not Available</span>';
    return decimals != null ? val.toFixed(decimals) + " " + unit : Math.round(val) + " " + unit;
  }

  const metricsRows = `
    <tr><td>Download speed</td><td>${naOrVal(m.download, "Mbps", 1)}</td></tr>
    <tr><td>Response time (latency)</td><td>${naOrVal(m.latency, "ms")}</td></tr>
    <tr><td>Jitter</td><td>${naOrVal(m.jitter, "ms")}</td></tr>
    <tr><td>Upload speed</td><td><span class="na">Not Available</span></td></tr>
    <tr><td>Packet loss</td><td><span class="na">Not Available</span></td></tr>`;

  const scoreRow = `<tr><td>Health score</td><td>${sc.score != null ? sc.score + " / 100 (" + sc.band.charAt(0).toUpperCase() + sc.band.slice(1) + ")" : '<span class="na">Not Available</span>'}</td></tr>`;

  const readinessRows = assessments.map(a => `
    <tr><td>${a.icon} ${a.name}</td><td>${a.status.charAt(0).toUpperCase() + a.status.slice(1)}${a.confidence === "limited" ? " (limited confidence)" : ""}</td></tr>
  `).join("");

  const problemsHtml = problems.length === 0
    ? "<p>No problems found.</p>"
    : "<ul>" + problems.map(p => `<li><strong>${p.title}</strong>: ${p.text}</li>`).join("") + "</ul>";

  const tipsHtml = tips.length === 0
    ? ""
    : "<h2>Recommendations</h2><ul>" + tips.map(t => `<li>${t}</li>`).join("") + "</ul>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CallReady Report – ${date}</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; color: #1d2530; max-width: 800px; margin: 0 auto; padding: 24px; line-height: 1.55; }
    h1 { font-size: 1.6rem; color: #0b2e59; margin-bottom: 4px; }
    h2 { font-size: 1.1rem; color: #0b2e59; border-bottom: 2px solid #e6f0fd; padding-bottom: 4px; margin-top: 22px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    td, th { padding: 6px 8px; border-bottom: 1px solid #d5dbe3; text-align: left; }
    ul { padding-left: 20px; }
    .na { color: #6b7584; font-style: italic; }
    .small { font-size: 0.82rem; color: #5b6675; }
  </style>
</head>
<body>
  <h1>CallReady Network Report</h1>
  <p class="small">Generated ${date}</p>

  <h2>Measurements</h2>
  <table>${metricsRows}${scoreRow}</table>

  <h2>Readiness by Activity</h2>
  <table>
    <tr><th>Activity</th><th>Verdict</th></tr>
    ${readinessRows}
  </table>

  <h2>Problems Found</h2>
  ${problemsHtml}

  ${tipsHtml}

  <h2>Score Breakdown</h2>
  ${sc.parts.length > 0
    ? "<table><tr><th>Metric</th><th>Sub-score</th><th>Weight</th></tr>" +
      sc.parts.map(p => `<tr><td>${p.name}</td><td>${p.sub.toFixed(0)} / 100</td><td>${(p.w * 100).toFixed(0)}%</td></tr>`).join("") +
      "</table>"
    : "<p class='na'>Not enough data to calculate a score.</p>"}
  ${sc.excluded.length > 0 ? `<p class="small">Excluded: ${sc.excluded.join(", ")}.</p>` : ""}

  <p class="small">This report contains only real measurements from your browser. Upload speed and packet loss are not measured in this version.</p>
</body>
</html>`;
}

/* ---------- Download report ---------- */
function downloadReport() {
  const html = buildReportHtml();
  if (!html) {
    alert("No test results to download. Run a network test first.");
    return;
  }
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "CallReady-Report-" + new Date().toISOString().slice(0, 10) + ".html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- Print report ---------- */
function printReport() {
  const html = buildReportHtml();
  if (!html) {
    alert("No test results to print. Run a network test first.");
    return;
  }
  // Fill the hidden print container
  const container = document.getElementById("printReport");
  if (container) {
    container.innerHTML = `<div class="report-doc">${html}</div>`;
  }
  window.print();
}

/* ---------- Event wiring ---------- */
const btnDownload = document.querySelector("#btnDownloadReport");
if (btnDownload) btnDownload.addEventListener("click", downloadReport);

const btnPrint = document.querySelector("#btnPrintReport");
if (btnPrint) btnPrint.addEventListener("click", printReport);
