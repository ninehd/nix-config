#!/usr/bin/env bash
# Bootstrap this home-manager config on a fresh machine.
# Idempotent: safe to re-run, each step is skipped if already done.
set -euo pipefail

REPO_DIR="$HOME/github/nix-config"
HOST="endeavour"
NIX_ZSH="$HOME/.nix-profile/bin/zsh"
GPU_SETUP="$HOME/.nix-profile/bin/non-nixos-gpu-setup"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

step "1/5 Nix"
if ! command -v nix >/dev/null; then
  curl -fsSL https://install.determinate.systems/nix | sh -s -- install
  # Make nix available in this shell without re-login
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
else
  echo "nix already installed"
fi

step "2/5 home-manager switch"
nix run home-manager -- switch --flake "$REPO_DIR#$HOST"

step "3/5 GPU drivers for Nix packages (non-NixOS)"
# Idempotent: just re-links /run/opengl-driver, safe to re-run.
sudo "$GPU_SETUP"

step "4/5 Register Nix zsh in /etc/shells"
if ! grep -qx "$NIX_ZSH" /etc/shells; then
  echo "$NIX_ZSH" | sudo tee -a /etc/shells
else
  echo "already registered"
fi

step "5/5 Login shell"
if [[ "$(getent passwd "$USER" | cut -d: -f7)" != "$NIX_ZSH" ]]; then
  chsh -s "$NIX_ZSH"
  echo "Log out and back in for the new shell to take effect."
else
  echo "already the login shell"
fi

step "Done"
