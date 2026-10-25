// Reviewer-facing report: one self-contained HTML page rendered from an audit result JSON.
//   npm run render -- <result.json> [out.html]
// Every number on the page comes from the result object; nothing is recomputed here.

import type { CaseResult } from "./agent.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const f2 = (x: number) => x.toFixed(2);
const ci = (p?: { measure?: string; es: number; lci: number; uci: number } | null) => (p ? `${p.measure ?? ""} ${f2(p.es)} <span class="ci">(${f2(p.lci)}–${f2(p.uci)})</span>` : "–");
const doiLink = (d?: string) => (d ? `<a href="https://doi.org/${esc(d.replace(/^https?:\/\/doi\.org\//, ""))}">${esc(d.replace(/^https?:\/\/doi\.org\//, ""))}</a>` : "");
const LABEL: Record<string, string> = {
  NO_CHANGE_DETECTED: "No change detected", ESTIMATE_SHIFTED: "Estimate shifted", SIGNIFICANCE_LOST: "Significance lost",
  SIGNIFICANCE_GAINED: "Significance gained", DIRECTION_FLIPPED: "Direction flipped", NO_REMAINING_EVIDENCE: "No evidence left", NEEDS_HUMAN_REVIEW: "Needs human review",
};
const TONE: Record<string, string> = { NO_CHANGE_DETECTED: "calm", ESTIMATE_SHIFTED: "warn", SIGNIFICANCE_LOST: "alert", SIGNIFICANCE_GAINED: "alert", DIRECTION_FLIPPED: "alert", NO_REMAINING_EVIDENCE: "alert", NEEDS_HUMAN_REVIEW: "stop" };

/** Forest-plot row on a log scale from 0.1 to 4 (the review's own axis). */
function forest(r: CaseResult): string {
  if (!r.published) return "";
  const W = 420, lo = Math.log(0.1), hi = Math.log(4);
  const x = (v: number) => Math.max(0, Math.min(W, ((Math.log(Math.max(v, 0.1001)) - lo) / (hi - lo)) * W));
  const bar = (p: { es: number; lci: number; uci: number }, y: number, cls: string) =>
    `<line x1="${x(p.lci).toFixed(1)}" x2="${x(p.uci).toFixed(1)}" y1="${y}" y2="${y}" class="${cls}" stroke-width="3"/><rect x="${(x(p.es) - 6).toFixed(1)}" y="${y - 6}" width="12" height="12" class="${cls}-mark"/>`;
  const ticks = [0.1, 0.25, 0.5, 1, 2, 4].map(t => `<line x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="4" y2="52" class="${t === 1 ? "null" : "grid"}"/>`).join("");
  return `<svg viewBox="-12 0 ${W + 24} 56" width="100%" role="img" aria-label="Published and recalculated ${esc(r.outcome)} estimates on a log scale">${ticks}${bar(r.published, 18, "pub")}${r.recalculated ? bar(r.recalculated, 40, "new") : ""}</svg>`;
}

function axis(): string {
  const W = 420, lo = Math.log(0.1), hi = Math.log(4), x = (v: number) => ((Math.log(v) - lo) / (hi - lo)) * W;
  return `<svg viewBox="-12 0 ${W + 24} 16" width="100%" role="img" aria-label="Risk ratio axis, log scale 0.1 to 4">${[0.1, 0.25, 0.5, 1, 2, 4].map(t => `<text x="${x(t).toFixed(1)}" y="12" text-anchor="middle" class="tick">${t}</text>`).join("")}</svg>`;
}

export function renderHtml(d: { review: string; data_source?: string; code_sha?: string; trace_head?: string; policy: any; results: CaseResult[]; impact?: any }, title = "Aftershock audit"): string {
  const rows = d.results.map(r => {
    const h = r.verdict?.headline ?? r.status;
    const ex = r.excluded.map(e => `<li><b>${esc(e.study)}</b>: ${esc(e.notice)} (${esc(e.rule)}). ${esc(e.scenario)}${e.replacement ? ` Replacement: ${doiLink(e.replacement)}.` : ""}</li>`).join("");
    const kept = r.kept.filter(k => k.notice !== "None").map(k => `<li><b>${esc(k.study)}</b>: ${esc(k.notice)}, kept by policy</li>`).join("");
    const notices = (r.notices ?? []).map(n => `<li>${esc(n.study)}: ${esc(n.notice)}, ${esc(n.date.split(" ")[0])}, notice ${doiLink(n.noticeDoi)}, matched on ${esc(n.matchedOn.toUpperCase())}, Retraction Watch #${esc(n.recordId)}</li>`).join("");
    const cc = r.crossCheck ? `${r.crossCheck.agrees === true ? "Agrees" : r.crossCheck.agrees === false ? "Differs" : "Not available"}${r.crossCheck.key ? ` · VITALITY ${esc(r.crossCheck.key)}` : ""}` : "–";
    return `<details class="row ${TONE[h] ?? "calm"}"><summary>
  <span class="o">${esc(r.outcome)}</span>
  <span class="n">${ci(r.published)}</span>
  <span class="n">${ci(r.recalculated)}</span>
  <span class="plot">${forest(r)}</span>
  <span class="pill">${esc(LABEL[h] ?? h)}</span>
  <span class="cc">${cc}</span>
</summary>
<div class="detail">
  ${r.status !== "VERIFIED" ? `<p class="stop-note"><b>Stopped:</b> ${esc(r.reason)}</p>` : `<p>${esc(r.verdict?.reason)}</p>
  <p class="meta">Gate: reproduced the published ${esc(r.published?.method)} ${esc(r.published?.measure)} from the study table in ${r.attempts} attempt${r.attempts === 1 ? "" : "s"} (computed ${f2(r.original!.es)}, ${f2(r.original!.lci)}–${f2(r.original!.uci)}). Independent check: ${esc(r.crossCheck?.vitality)}.</p>`}
  ${ex ? `<h4>Excluded</h4><ul>${ex}</ul>` : ""}${kept ? `<h4>Flagged, kept</h4><ul>${kept}</ul>` : ""}${notices ? `<h4>Editorial notices found</h4><ul>${notices}</ul>` : ""}
  ${r.report ? `<h4>Report</h4><pre>${esc(r.report)}</pre>` : ""}
</div></details>`;
  }).join("\n");
  const ruleList = Object.entries(d.policy.exclude).map(([k, v]) => `<li><b>${esc(k)}</b>: ${v ? "exclude" : "keep"}${d.policy.provenance?.[k] ? ` <span class="meta">(${esc(d.policy.provenance[k])})</span>` : ""}</li>`).join("");
  const imp = d.impact;
  const cands = imp ? [...imp.guidelines.map((g: any) => ({ ...g, k: "Guideline-type" })), ...imp.reviews.slice(0, 8).map((g: any) => ({ ...g, k: "Later review" }))]
    .map((g: any) => `<li><span class="tag">${g.k}</span> ${esc(g.year)} · ${g.doi ? `<a href="${esc(g.doi)}">${esc(g.title)}</a>` : esc(g.title)} <span class="meta">${esc(g.venue)}</span></li>`).join("") : "";
  const verified = d.results.filter(r => r.status === "VERIFIED").length;
  const changed = d.results.filter(r => r.verdict && r.verdict.headline !== "NO_CHANGE_DETECTED").length;
  return `<title>${esc(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
/* Layout: a single reading column; each outcome is one forest-plot row that opens into its evidence. */
:root{--bg:#F7F7F4;--panel:#FFFFFF;--ink:#10232A;--muted:#55666A;--line:#D3DCDA;--accent:#C2531F;--teal:#2F7F86;--calm:#2F7F86;--warn:#A86A12;--alert:#C2531F;--stop:#7A2E8E;
--display:'EB Garamond',Georgia,serif;--body:'IBM Plex Sans',Arial,sans-serif;--mono:'IBM Plex Mono','Courier New',monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0E1D22;--panel:#152A30;--ink:#ECEDE7;--muted:#A3B5B2;--line:#2B444A;--accent:#F08A5D;--teal:#6FC1C4;--calm:#6FC1C4;--warn:#E3A846;--alert:#F08A5D;--stop:#C98BDA;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0E1D22;--panel:#152A30;--ink:#ECEDE7;--muted:#A3B5B2;--line:#2B444A;--accent:#F08A5D;--teal:#6FC1C4;--calm:#6FC1C4;--warn:#E3A846;--alert:#F08A5D;--stop:#C98BDA;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.55 var(--body)}
main{max-width:1180px;margin:0 auto;padding-block:40px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:28px}
h1{font:600 clamp(30px,5vw,46px)/1.1 var(--display);margin:0;text-wrap:balance}
h2{font:600 24px/1.2 var(--display);margin:0}
h4{font:600 12px var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:14px 0 4px}
.eyebrow{font:500 12px var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.lede{color:var(--muted);max-width:68ch;margin:6px 0 0}
.stats{display:flex;flex-wrap:wrap;gap:12px 36px;font:500 14px var(--body);color:var(--muted)}
.stats b{font:600 22px var(--mono);color:var(--ink);margin-right:6px}
.table{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.head,summary{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(130px,1fr) minmax(130px,1fr) minmax(180px,1.6fr) 150px minmax(120px,1fr);gap:14px;align-items:center;padding:12px 18px}
.head{font:600 11px var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line)}
details.row{border-bottom:1px solid var(--line)}details.row:last-child{border-bottom:none}
summary{cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}
summary:hover{background:color-mix(in srgb,var(--line) 25%,transparent)}
summary:focus-visible{outline:2px solid var(--teal);outline-offset:-2px}
.o{font-weight:600}.n{font:400 13px var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}.ci{color:var(--muted)}
.cc{font-size:13px;color:var(--muted)}
.pill{justify-self:start;font:600 12px var(--body);padding:4px 10px;border-radius:999px;border:1px solid currentColor}
.calm .pill{color:var(--calm)}.warn .pill{color:var(--warn)}.alert .pill{color:var(--alert)}.stop .pill{color:var(--stop)}
svg .tick{fill:var(--muted);font:600 11px var(--body)}svg .grid{stroke:var(--line);stroke-width:1}svg .null{stroke:var(--muted);stroke-width:1.5;stroke-dasharray:3 3}
svg .pub{stroke:var(--muted)}svg .pub-mark{fill:var(--muted)}svg .new{stroke:var(--accent)}svg .new-mark{fill:var(--accent)}
.detail{padding:4px 18px 18px;max-width:900px}.detail ul{margin:0;padding-left:18px}.detail p{margin:6px 0}
.meta{color:var(--muted);font-size:13px}.stop-note{color:var(--stop)}
pre{white-space:pre-wrap;font:13px/1.5 var(--mono);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;margin:0;overflow-x:auto}
.legend{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.legend i{display:inline-block;width:18px;height:3px;vertical-align:middle;margin-right:6px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}.cols>section{min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px 20px}
.cols ul{padding-left:18px;margin:8px 0 0}.tag{font:600 11px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--teal)}
code{font:13px var(--mono);word-break:break-all}a{color:var(--teal)}
@media (max-width:860px){.head{display:none}summary{grid-template-columns:1fr 1fr;row-gap:8px}.plot{grid-column:1/-1}.cols{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
<main>
<header>
  <div class="eyebrow">Aftershock · evidence-integrity audit</div>
  <h1>Liyanage 2016, Mediterranean diet and cardiovascular outcomes</h1>
  <p class="lede">Review ${doiLink(d.review)}. Each published pooled result was reproduced from the study table before any change was measured. Open a row for the notices, the excluded studies and the report.</p>
</header>
<div class="stats"><span><b>${verified}/${d.results.length}</b>outcomes verified</span><span><b>${changed}</b>changed</span><span><b>${d.results.filter(r => r.crossCheck?.agrees === true).length}</b>agree with VITALITY</span><span><b>${esc(d.data_source ?? "")}</b>data source</span></div>
<div class="legend"><span><i style="background:var(--muted)"></i>Published, 95% CI</span><span><i style="background:var(--accent)"></i>Without excluded studies</span><span>Dashed line: no effect (RR 1). Log scale, 0.1 to 4.</span></div>
<div class="table">
<div class="head"><span>Outcome</span><span>Published</span><span>Recalculated</span><span>${axis()}</span><span>Verdict</span><span>Independent check</span></div>
${rows}
</div>
<div class="cols">
<section><h2>Exclusion policy in force</h2><ul>${ruleList}</ul><p class="meta">Recalled from Meterless H-MEM where a provenance is shown; otherwise the default.</p></section>
<section><h2>Provenance</h2><p class="meta">Code sha256 <code>${esc(d.code_sha ?? "")}</code></p><p class="meta">Trace head <code>${esc(d.trace_head ?? "")}</code></p><p class="meta">Check with <code>npm run verify-trace -- &lt;trace.jsonl&gt;</code>.</p></section>
</div>
${imp ? `<section class="cols" style="grid-template-columns:1fr"><section><h2>Later documents to check</h2><p class="meta">${imp.citedByCount} works cite this review; ${imp.sampled} scanned (OpenAlex). Candidates are matched by title and need a human to confirm whether they relied on a changed outcome.</p><ul>${cands}</ul></section></section>` : ""}
</main>`;
}
