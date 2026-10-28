#!/bin/sh
# Instala os units de usuário. Espera o repo em ~/assistente-pessoal (ou ajuste o link simbólico).
set -e
repo="$(cd "$(dirname "$0")/.." && pwd)"
[ -e "$HOME/assistente-pessoal" ] || ln -s "$repo" "$HOME/assistente-pessoal"
mkdir -p "$HOME/.config/systemd/user"
cp "$repo"/systemd/*.service "$repo"/systemd/*.timer "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now assistente-painel.service assistente-tick.timer
loginctl enable-linger "$USER" || true
systemctl --user --no-pager status assistente-painel.service assistente-tick.timer | head -20
