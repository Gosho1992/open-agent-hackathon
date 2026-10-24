#!/bin/bash
# Fix Codespace docker networking (legacy iptables drops bridge traffic), then start Zetaris
sudo iptables-legacy -P FORWARD ACCEPT
sudo iptables-legacy -I FORWARD 1 -j ACCEPT
sudo iptables -I FORWARD 1 -j ACCEPT
cd /workspaces/open-agent-hackathon/zetaris-platform && docker compose up -d && bash verify.sh
