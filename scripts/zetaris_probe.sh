#!/bin/bash
# Shows how the Zetaris UI calls the SQL editor endpoints (request body shape).
docker exec zetaris-ui-1 sh -c 'grep -rhoE ".{0,400}sql-editor/sqls/run(-query)?[^-a-z].{0,500}" /usr/share/nginx/html /app /srv 2>/dev/null' | head -c 6000
