"""Day-0 gate: reproduce Liyanage 2016 published pooled estimates (fixed-effect Mantel-Haenszel RR)."""
import csv, math, collections, pathlib
D = pathlib.Path(__file__).resolve().parent.parent / "data" / "studies"

def mh_rr(rows):
    num = den = pv = 0.0
    for r in rows:
        a, n1, c, n2 = (int(r[k]) for k in ("treat_events", "treat_n", "ctrl_events", "ctrl_n"))
        n = n1 + n2
        num += a * n2 / n; den += c * n1 / n
        pv += (n1 * n2 * (a + c) - a * c * n) / n**2   # Greenland-Robins variance
    rr = num / den; se = math.sqrt(pv / (num * den))
    return rr, math.exp(math.log(rr) - 1.96 * se), math.exp(math.log(rr) + 1.96 * se)

studies = collections.defaultdict(list)
for r in csv.DictReader(open(D / "liyanage2016_med_diet.csv")):
    studies[r["outcome"]].append(r)

ok = n = 0
for p in csv.DictReader(open(D / "published_pooled.csv")):
    rows = studies[p["outcome"]]
    if p["scenario"] != "all":
        rows = [r for r in rows if "Singh" not in r["study"]]
    got = mh_rr(rows); exp = (float(p["es"]), float(p["lci"]), float(p["uci"]))
    good = all(abs(round(g, 2) - e) <= 0.011 for g, e in zip(got, exp))
    ok += good; n += 1
    print("PASS" if good else "FAIL", p["outcome"], "|", p["scenario"], "| published", exp, "| got", tuple(round(g, 2) for g in got))
print(f"{ok}/{n} reproduced")
mace = [r for r in studies["MACE"] if "PREDIMED" not in r["study"]]
print("MACE without PREDIMED:", tuple(round(x, 2) for x in mh_rr(mace)), "(VITALITY answer key: 0.43, 0.32-0.58)")
