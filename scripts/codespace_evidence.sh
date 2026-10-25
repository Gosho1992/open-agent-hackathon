#!/bin/bash
# Runs inside the Codespace that hosts Zetaris: start the platform, (re)build the USL, run the
# live audits, and commit the traces as evidence. Output: /workspaces/evidence_run.txt
set -u
cd /workspaces/open-agent-hackathon || exit 1
git pull -q origin main
npm install -s >/dev/null 2>&1
[ -d vendor/hmem ] || npm run -s setup >/dev/null 2>&1
# A stopped driver keeps GBs of Spark scratch in its writable layer: recreate it (data lives in volumes).
[ "$(docker inspect zetaris-driver-1 --format '{{.State.Status}}' 2>/dev/null)" = running ] || docker rm -f zetaris-driver-1 >/dev/null 2>&1
df -h / | tail -1
bash scripts/start-zetaris.sh > /workspaces/start.log 2>&1; grep -E "PASS|FAIL|rror" /workspaces/start.log | head -20
for i in $(seq 1 40); do [ "$(docker inspect zetaris-driver-1 --format '{{.State.Health.Status}}')" = healthy ] && break; sleep 10; done
echo "driver: $(docker inspect zetaris-driver-1 --format '{{.State.Health.Status}}')"
npm run -s zetaris:setup 2>&1 | grep -vE "^\.env"
mkdir -p evidence/traces
export EXTRACTION=curated IMPACT=cache AFTERSHOCK_QUIET=true
npm run -s audit > evidence/zetaris_live_audit.txt 2>&1
cat evidence/zetaris_live_audit.txt | grep -vE "^\.env"
npm run -s audit -- --outcome Stroke --corrupt > evidence/zetaris_live_recovery.txt 2>&1
for f in $(ls -t .aftershock/traces/*audit-all*.jsonl | head -1) $(ls -t .aftershock/traces/*audit-stroke*.jsonl | head -1); do
  b=$(basename "$f" .jsonl); cp "$f" "evidence/traces/live-zetaris_$b.jsonl"; cp "${f%.jsonl}.result.json" "evidence/traces/live-zetaris_$b.result.json"
  npm run -s verify-trace -- "evidence/traces/live-zetaris_$b.jsonl"
done
grep -c '"event":"zetaris.query"' evidence/traces/live-zetaris_*audit-all*.jsonl
git add evidence && git commit -qm "Evidence: live Zetaris USL rebuild + hash-chained live audit traces" && git push -q origin main && echo PUSHED
