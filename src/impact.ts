// Impact Tracer: which later documents cite the audited meta-analysis?
// Uses OpenAlex (open scholarly graph). Results are cached in data/impact/ so sample mode
// and judges can replay them; a live run refreshes the cache.
//
// A citation means "potentially affected", never "invalid". Guideline-like documents are
// flagged so a reviewer can check whether they relied on the changed outcome.

import fs from "node:fs";
import path from "node:path";
import { trace } from "./trace.ts";

export interface CitingWork { id: string; title: string; year: number; type: string; venue: string; doi: string | null; kind: "guideline" | "review" | "other" }
export interface ImpactResult { reviewDoi: string; citedByCount: number; sampled: number; guidelines: CitingWork[]; reviews: CitingWork[]; others?: CitingWork[]; source: "openalex-live" | "cache" }

const CACHE = path.resolve("data/impact");
const SAMPLE = process.env.SAMPLE_MODE === "true";
const MAILTO = process.env.OPENALEX_MAILTO ?? "aftershock@example.org";
// A guideline-type document issues recommendations; studies *about* guidelines (adherence, association) are not.
const GUIDE = /guidelines? (for|on|of)\b|clinical practice guideline|\bguidelines? \d{4}|recommendations? (of|for|on)\b|document of recommendations|consensus (statement|document|report)|position (statement|paper)|scientific statement|practice advisory/i;
const NOT_GUIDE = /adherence|association|associated|compliance with|from specific recommendations/i;
const classify = (w: { title: string; type: string }): CitingWork["kind"] =>
  GUIDE.test(w.title) && !NOT_GUIDE.test(w.title) ? "guideline" : REVIEW.test(w.title) || w.type === "review" ? "review" : "other";
const REVIEW = /systematic review|meta-analys|umbrella review|overview of reviews|evidence synthesis/i;

const file = (doi: string) => path.join(CACHE, doi.replace(/[^a-z0-9]+/gi, "_").toLowerCase() + ".json");

export async function traceImpact(reviewDoi: string, opts: { pages?: number } = {}): Promise<ImpactResult> {
  if (SAMPLE || process.env.IMPACT === "cache") {
    if (fs.existsSync(file(reviewDoi))) {
      const raw = JSON.parse(fs.readFileSync(file(reviewDoi), "utf8")) as ImpactResult;
      const all = [...raw.guidelines, ...raw.reviews, ...((raw as any).others ?? [])].map(w => ({ ...w, kind: classify(w) }));
      const r = { ...raw, guidelines: all.filter(w => w.kind === "guideline"), reviews: all.filter(w => w.kind === "review") };
      trace("impact", { source: "cache", cited_by: r.citedByCount, guidelines: r.guidelines.length, reviews: r.reviews.length });
      return { ...r, source: "cache" };
    }
    trace("impact", { source: "cache", note: "no cached citation data for this review" });
    return { reviewDoi, citedByCount: 0, sampled: 0, guidelines: [], reviews: [], source: "cache" };
  }
  const api = "https://api.openalex.org";
  const key = process.env.OPENALEX_API_KEY ? `&api_key=${process.env.OPENALEX_API_KEY}` : "";
  const work: any = await (await fetch(`${api}/works/doi:${reviewDoi}?select=id,cited_by_count&mailto=${MAILTO}${key}`)).json();
  const wid = String(work.id).split("/").pop();
  const out: CitingWork[] = [];
  let cursor = "*";
  for (let page = 0; page < (opts.pages ?? 2) && cursor; page++) {
    const res: any = await (await fetch(`${api}/works?filter=cites:${wid}&per-page=200&cursor=${encodeURIComponent(cursor)}&select=id,display_name,publication_year,type,primary_location,doi&mailto=${MAILTO}${key}`)).json();
    for (const w of res.results ?? []) {
      const title = w.display_name ?? "";
      out.push({
        id: w.id, title, year: w.publication_year, type: w.type, doi: w.doi,
        venue: w.primary_location?.source?.display_name ?? "",
        kind: classify({ title, type: w.type }),
      });
    }
    cursor = res.meta?.next_cursor;
  }
  const result: ImpactResult = {
    reviewDoi, citedByCount: work.cited_by_count, sampled: out.length,
    guidelines: out.filter(w => w.kind === "guideline").sort((a, b) => b.year - a.year),
    reviews: out.filter(w => w.kind === "review").sort((a, b) => b.year - a.year),
    others: out.filter(w => w.kind === "other"),
    source: "openalex-live",
  };
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file(reviewDoi), JSON.stringify(result, null, 2));
  trace("impact", { source: "openalex-live", cited_by: result.citedByCount, sampled: out.length, guidelines: result.guidelines.length, reviews: result.reviews.length });
  return result;
}
