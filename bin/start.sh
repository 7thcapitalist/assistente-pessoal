#!/bin/sh
# Sobe o painel só na interface da tailnet (nunca em 0.0.0.0). Sem tailscale, cai pra localhost.
cd "$(dirname "$0")/.." || exit 1
HOST="${HOST:-$(tailscale ip -4 2>/dev/null | head -n1)}"
export HOST="${HOST:-127.0.0.1}"
exec node bin/server.js
