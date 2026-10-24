// Deterministic meta-analysis core. The language model never computes a pooled estimate:
// every number Aftershock reports comes from these functions.
//
// Supported methods (the ones that cover most of the VITALITY answer key):
//   "Fixed MH"   Mantel-Haenszel, fixed effect (RR, OR, RD)
//   "Random MH"  Mantel-Haenszel weights for tau^2 is not standard; RevMan computes
//                DerSimonian-Laird on inverse-variance study estimates. We follow RevMan.
//   "Fixed IV"   inverse variance, fixed effect (RR, OR, RD, MD, SMD-precomputed)
//   "Random IV"  inverse variance with DerSimonian-Laird tau^2
//   "Peto"       Peto one-step odds ratio

export type Measure = "RR" | "OR" | "RD" | "MD";
export type Method = "Fixed MH" | "Random MH" | "Fixed IV" | "Random IV" | "Peto";

/** A binary-outcome study: events and totals in each arm. */
export interface BinaryStudy {
  id: string;
  treatEvents: number;
  treatN: number;
  ctrlEvents: number;
  ctrlN: number;
}

/** A study given as an effect estimate with a 95% CI (ratio measures on the natural scale). */
export interface EstimateStudy {
  id: string;
  es: number;
  lci: number;
  uci: number;
}

export interface Pooled {
  method: Method;
  measure: Measure;
  es: number;
  lci: number;
  uci: number;
  p: number;
  k: number; // number of contributing studies
  tau2?: number;
  i2?: number;
}

const Z = 1.959963984540054;
const isRatio = (m: Measure) => m === "RR" || m === "OR";

function normalCdf(x: number): number {
  // Abramowitz-Stegun 7.1.26 via erf, accurate to ~1e-7, enough for p-values.
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
const twoSidedP = (z: number) => 2 * (1 - normalCdf(Math.abs(z)));

function finish(method: Method, measure: Measure, est: number, se: number, k: number, extra: Partial<Pooled> = {}): Pooled {
  const lo = est - Z * se, hi = est + Z * se;
  const back = isRatio(measure) ? Math.exp : (x: number) => x;
  return { method, measure, es: back(est), lci: back(lo), uci: back(hi), p: twoSidedP(est / se), k, ...extra };
}

/** Studies with zero events in both arms carry no information for RR/OR and are dropped (RevMan behaviour). */
function informative(studies: BinaryStudy[], measure: Measure): BinaryStudy[] {
  if (measure === "RD") return studies;
  return studies.filter(s => !(s.treatEvents === 0 && s.ctrlEvents === 0) && !(s.treatEvents === s.treatN && s.ctrlEvents === s.ctrlN));
}

/** Per-study log effect and variance, with 0.5 continuity correction when a cell is zero. */
export function studyEffect(s: BinaryStudy, measure: Measure): { y: number; v: number } {
  let a = s.treatEvents, b = s.treatN - s.treatEvents, c = s.ctrlEvents, d = s.ctrlN - s.ctrlEvents;
  if (measure !== "RD" && (a === 0 || b === 0 || c === 0 || d === 0)) { a += 0.5; b += 0.5; c += 0.5; d += 0.5; }
  const n1 = a + b, n2 = c + d;
  switch (measure) {
    case "RR": return { y: Math.log((a / n1) / (c / n2)), v: 1 / a - 1 / n1 + 1 / c - 1 / n2 };
    case "OR": return { y: Math.log((a * d) / (b * c)), v: 1 / a + 1 / b + 1 / c + 1 / d };
    case "RD": { const p1 = a / n1, p2 = c / n2; return { y: p1 - p2, v: p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2 }; }
    default: throw new Error(`studyEffect: ${measure} needs continuous data`);
  }
}

/** 0.5 added to every cell of a study that has a zero cell (Stata metan / RevMan default for MH). */
function corrected(s: BinaryStudy): BinaryStudy {
  const zero = s.treatEvents === 0 || s.ctrlEvents === 0 || s.treatEvents === s.treatN || s.ctrlEvents === s.ctrlN;
  return zero ? { ...s, treatEvents: s.treatEvents + 0.5, treatN: s.treatN + 1, ctrlEvents: s.ctrlEvents + 0.5, ctrlN: s.ctrlN + 1 } : s;
}

function mantelHaenszel(raw: BinaryStudy[], measure: Measure): { est: number; se: number } {
  const studies = measure === "RD" ? raw : raw.map(corrected);
  if (measure === "RR") {
    let R = 0, S = 0, P = 0;
    for (const s of studies) {
      const n = s.treatN + s.ctrlN;
      R += s.treatEvents * s.ctrlN / n;
      S += s.ctrlEvents * s.treatN / n;
      P += (s.treatN * s.ctrlN * (s.treatEvents + s.ctrlEvents) - s.treatEvents * s.ctrlEvents * n) / (n * n);
    }
    return { est: Math.log(R / S), se: Math.sqrt(P / (R * S)) };
  }
  if (measure === "OR") {
    // Robins-Breslow-Greenland variance.
    let R = 0, S = 0, PR = 0, PS_QR = 0, QS = 0;
    for (const s of studies) {
      const a = s.treatEvents, b = s.treatN - a, c = s.ctrlEvents, d = s.ctrlN - c, n = a + b + c + d;
      const r = a * d / n, sv = b * c / n, p = (a + d) / n, q = (b + c) / n;
      R += r; S += sv; PR += p * r; PS_QR += p * sv + q * r; QS += q * sv;
    }
    const v = PR / (2 * R * R) + PS_QR / (2 * R * S) + QS / (2 * S * S);
    return { est: Math.log(R / S), se: Math.sqrt(v) };
  }
  if (measure === "RD") {
    let num = 0, W = 0, vnum = 0;
    for (const s of studies) {
      const n = s.treatN + s.ctrlN, w = s.treatN * s.ctrlN / n;
      num += (s.treatEvents * s.ctrlN - s.ctrlEvents * s.treatN) / n;
      W += w;
      vnum += (s.treatEvents * (s.treatN - s.treatEvents) * s.ctrlN ** 3 + s.ctrlEvents * (s.ctrlN - s.ctrlEvents) * s.treatN ** 3) / (s.treatN * s.ctrlN * n * n);
    }
    return { est: num / W, se: Math.sqrt(vnum / (W * W)) };
  }
  throw new Error(`Mantel-Haenszel not defined for ${measure}`);
}

function peto(studies: BinaryStudy[]): { est: number; se: number } {
  let OmE = 0, V = 0;
  for (const s of studies) {
    const n = s.treatN + s.ctrlN, m = s.treatEvents + s.ctrlEvents;
    OmE += s.treatEvents - s.treatN * m / n;
    V += s.treatN * s.ctrlN * m * (n - m) / (n * n * (n - 1));
  }
  return { est: OmE / V, se: Math.sqrt(1 / V) };
}

/** Inverse-variance pooling of (y, v) pairs, fixed or DerSimonian-Laird random effects. */
export function inverseVariance(ys: { y: number; v: number }[], random: boolean): { est: number; se: number; tau2: number; i2: number } {
  const w = ys.map(s => 1 / s.v);
  const sw = w.reduce((a, b) => a + b, 0);
  const fixed = ys.reduce((acc, s, i) => acc + w[i] * s.y, 0) / sw;
  const Q = ys.reduce((acc, s, i) => acc + w[i] * (s.y - fixed) ** 2, 0);
  const df = ys.length - 1;
  const i2 = Q > 0 && df > 0 ? Math.max(0, (Q - df) / Q) : 0;
  if (!random || df === 0) return { est: fixed, se: Math.sqrt(1 / sw), tau2: 0, i2 };
  const c = sw - w.reduce((a, b) => a + b * b, 0) / sw;
  const tau2 = Math.max(0, (Q - df) / c);
  const wr = ys.map(s => 1 / (s.v + tau2));
  const swr = wr.reduce((a, b) => a + b, 0);
  return { est: ys.reduce((acc, s, i) => acc + wr[i] * s.y, 0) / swr, se: Math.sqrt(1 / swr), tau2, i2 };
}

/** Pool binary studies with the review's own stated method. */
export function poolBinary(all: BinaryStudy[], method: Method, measure: Measure): Pooled {
  const studies = informative(all, measure);
  if (studies.length === 0) throw new Error("no informative studies");
  if (method === "Peto") { const r = peto(studies); return finish("Peto", "OR", r.est, r.se, studies.length); }
  if (method === "Fixed MH") { const r = mantelHaenszel(studies, measure); return finish(method, measure, r.est, r.se, studies.length); }
  const effects = studies.map(s => studyEffect(s, measure));
  const random = method === "Random MH" || method === "Random IV";
  const r = inverseVariance(effects, random);
  return finish(method, measure, r.est, r.se, studies.length, { tau2: r.tau2, i2: r.i2 });
}

/** Pool studies given as estimate + 95% CI (generic inverse variance). */
export function poolEstimates(studies: EstimateStudy[], method: "Fixed IV" | "Random IV", measure: Measure): Pooled {
  const ratio = isRatio(measure);
  const effects = studies.map(s => {
    const y = ratio ? Math.log(s.es) : s.es;
    const se = ratio ? (Math.log(s.uci) - Math.log(s.lci)) / (2 * Z) : (s.uci - s.lci) / (2 * Z);
    return { y, v: se * se };
  });
  const r = inverseVariance(effects, method === "Random IV");
  return finish(method, measure, r.est, r.se, studies.length, { tau2: r.tau2, i2: r.i2 });
}
