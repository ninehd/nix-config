{ config, lib, pkgs, ... }:

{
  # Machine-specific entry point for WSL. Pulls in the shared config, then
  # trims what doesn't make sense under WSL.
  imports = [
    ../home/common.nix
    ../home/features/zsh-wsl.nix
  ];

  home.username = "wdhenin";
  home.homeDirectory = "/home/wdhenin";

  targets.genericLinux.enable = true;

  # Target of the `hms` alias (see home/features/zsh.nix).
  home.sessionVariables.FLAKE = "${config.home.homeDirectory}/nix-config#wsl";

  # Python with ensurepip/venv for WSL tools expecting a full Python.
  # Noto fonts cover broad Unicode text plus color emoji in WSLg apps.
  home.packages = with pkgs; [
    noto-fonts
    noto-fonts-color-emoji
    python312
  ];

  # WSLg apps should prefer JetBrains Mono and fall back to Nerd Font glyphs.
  fonts.fontconfig.defaultFonts.monospace = [
    "JetBrains Mono"
    "Symbols Nerd Font Mono"
  ];

  # Brave, Chrome, Discord, Dioxus CLI, Ghostty, JetBrains IDEA, Maven,
  # Gradle, and Nix-managed Git/Rust aren't needed here (WSL uses Windows
  # apps/toolchains instead).
  programs.brave.enable = lib.mkForce false;
  programs.google-chrome.enable = lib.mkForce false;
  programs.ghostty.enable = lib.mkForce false;
  programs.git.enable = lib.mkForce false;
  home.discord.enable = false;
  home.jetbrains.enable = false;
  home.dioxus.enable = false;
  home.sqlx.enable = false;
  home.mavenGradle.enable = false;
  home.rust.enable = false;
}
