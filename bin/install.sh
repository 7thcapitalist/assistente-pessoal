#!/bin/sh
# Instala/atualiza o serviço de usuário. Uso: bin/install.sh  (rode a partir de ~/apps/assistente-pessoal, um clone da main)
set -e
mkdir -p "$HOME/.config/systemd/user" "$(dirname "$0")/../data"
cp "$(dirname "$0")"/../systemd/assistente-* "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
systemctl --user enable --now assistente-painel.service assistente-tick.timer
systemctl --user --no-pager status assistente-painel.service assistente-tick.timer | head -20
