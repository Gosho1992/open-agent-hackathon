#!/bin/bash
# Lists the Zetaris API's documented endpoints (Tapir OpenAPI) so we can find the DDL route.
cd "$(dirname "$0")/.." || exit 1
API_PORT=$(sed -n 's/^API_PORT=//p' zetaris-platform/.env | tail -1); API_PORT=${API_PORT:-8888}
for u in "http://localhost:$API_PORT/docs/docs.yaml" "http://localhost:$API_PORT/docs/docs.json" "http://localhost:$API_PORT/api/v1.0/docs/docs.yaml" "http://localhost:3000/api/proxy/docs/docs.yaml" "http://localhost:$API_PORT/docs" "http://localhost:$API_PORT/openapi.yaml"; do
  code=$(curl -s -o /tmp/probe.out -w '%{http_code}' "$u"); echo "$code $u $(head -c 120 /tmp/probe.out | tr '\n' ' ')"
  if [ "$code" = 200 ] && grep -q 'paths' /tmp/probe.out; then echo "== paths containing sql/query/ddl/statement:"; grep -nE "^  /.*(sql|query|ddl|statement|execute|run)" /tmp/probe.out | head -40; break; fi
done
docker exec zetaris-api-1 sh -c 'ls / /app 2>/dev/null | head -30' 2>&1 | head -30
