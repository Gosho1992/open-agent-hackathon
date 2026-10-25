#!/bin/bash
# Finds the Zetaris API routes for running SQL (DDL included) by scanning the UI bundle and API jar.
echo "== UI bundle routes"
docker exec zetaris-ui-1 sh -c 'grep -rhoE "\"?/?(api/)?(proxy/)?[a-z-]*(query|sql|ddl|statement|lightning|usl|editor)[a-zA-Z0-9/_{}:.-]*" /usr/share/nginx/html /app /srv 2>/dev/null | sort | uniq -c | sort -rn | head -60'
echo "== API jar routes"
docker exec zetaris-api-1 sh -c 'for j in $(find / -name "*.jar" -size +1M 2>/dev/null | grep -viE "jdk|jre" | head -5); do echo "-- $j"; unzip -p "$j" 2>/dev/null | strings 2>/dev/null | grep -oE "(sql|query|ddl|statement|editor)[a-zA-Z0-9/_-]{2,40}" | sort | uniq -c | sort -rn | head -40; done' 2>&1 | head -90
