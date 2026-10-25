#!/bin/bash
# Finds the Zetaris API routes for running SQL by scanning the UI bundle for path literals.
docker exec zetaris-ui-1 sh -c 'grep -rhoE "[\"\`'"'"'](/api)?/(proxy/)?[a-z][a-zA-Z0-9_-]*(/[a-zA-Z0-9_{}:\$.-]+)+" /usr/share/nginx/html /app /srv 2>/dev/null' | tr -d "\"'\`" | grep -iE "query|sql|usl|lightning|ddl|statement|execute|run" | sort | uniq -c | sort -rn | head -70
echo "== api endpoints in API jar"
docker exec zetaris-api-1 sh -c 'find / -name "*.jar" 2>/dev/null | grep -viE "/jdk|/jre|/java/" | head -3'
