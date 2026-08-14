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
  home.packages = [ pkgs.python312 ];

  # Brave, Chrome, Discord, Ghostty, JetBrains IDEA, Maven, Gradle, and
  # Nix-managed Git/Rust aren't needed here (WSL uses Windows apps/toolchains
  # instead).
  programs.brave.enable = lib.mkForce false;
  programs.google-chrome.enable = lib.mkForce false;
  programs.ghostty.enable = lib.mkForce false;
  programs.git.enable = lib.mkForce false;
  home.discord.enable = false;
  home.jetbrains.enable = false;
  home.mavenGradle.enable = false;
  home.rust.enable = false;
}
