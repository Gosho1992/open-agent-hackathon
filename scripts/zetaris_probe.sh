#!/bin/bash
# Shows how the Zetaris UI calls the SQL editor endpoints (request body shape).
mkdir -p /tmp/uib && rm -f /tmp/uib/*
for f in $(docker exec zetaris-ui-1 sh -c 'grep -rl "sql-editor/sqls/run" /usr/share/nginx/html /app /srv 2>/dev/null' | head -8); do
  docker cp "zetaris-ui-1:$f" "/tmp/uib/$(echo "$f" | tr '/' '_')" >/dev/null 2>&1; done
ls /tmp/uib
python3 - <<'PY'
import glob,re
for f in glob.glob('/tmp/uib/*'):
    s=open(f,encoding='utf-8',errors='ignore').read()
    for m in re.finditer(r'sql-editor/sqls/run(-query)?["`\']', s):
        print('=====', f.split('/')[-1][-60:], m.group(0)); print(s[max(0,m.start()-500):m.end()+700].replace('\n',' ')); print()
PY
