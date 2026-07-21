{ lib, ... }:

{
  # Machine-specific entry point for WSL. Pulls in the shared config, then
  # trims what doesn't make sense under WSL.
  imports = [
    ../home/common.nix
  ];

  home.homeDirectory = "/home/wdhenin";

  targets.genericLinux.enable = true;

  # Brave, Discord, and Ghostty aren't needed here (WSL uses the Windows
  # terminal instead).
  programs.brave.enable = lib.mkForce false;
  programs.ghostty.enable = lib.mkForce false;
  home.discord.enable = false;
}
