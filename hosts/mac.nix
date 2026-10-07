{ config, lib, ... }:

{
  # Machine-specific entry point for the current Apple Silicon Mac.
  imports = [
    ../home/common.nix
  ];

  home.username = "william";
  home.homeDirectory = "/Users/william";

  # Target of the `hms` alias (see home/features/zsh.nix).
  home.sessionVariables.FLAKE = "${config.home.homeDirectory}/nix-config#mac";

  # Ghostty is configured by Home Manager, but installed outside Nix: nixpkgs'
  # ghostty package is Linux-only at the moment.
  programs.brave.enable = lib.mkForce false;
  programs.google-chrome.enable = lib.mkForce false;
  programs.ghostty = {
    enable = true;
    package = null;
    settings.font-size = lib.mkForce 16;
  };
  home.vscode.enable = false;
  home.discord.enable = false;
  home.jetbrains.enable = false;
}
