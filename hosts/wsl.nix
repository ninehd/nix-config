{ lib, ... }:

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

  # Brave, Discord, Ghostty, and Git aren't needed here (WSL uses the Windows
  # terminal and Git installation instead).
  programs.brave.enable = lib.mkForce false;
  programs.ghostty.enable = lib.mkForce false;
  programs.git.enable = lib.mkForce false;
  home.discord.enable = false;
}
