{ config, lib, pkgs, ... }:

{
  # Minimal command-line environment for the Debian VM.
  imports = [
    ../home/features/ai.nix
    ../home/features/git.nix
    ../home/features/zsh.nix
  ];

  home.username = "ninehd";
  home.homeDirectory = "/home/ninehd";
  home.stateVersion = "25.05";

  targets.genericLinux = {
    enable = true;
    gpu.enable = false;
  };
  programs.home-manager.enable = true;
  manual.manpages.enable = false;

  home.sessionVariables = {
    FLAKE = "${config.home.homeDirectory}/nix-config#debian";
    FFF_ENABLE_HOME_SCAN = "0";
  };

  # Keep only Node in Pi's private PATH; the desktop profiles additionally
  # provide Bun and RTK.
  programs.pi-coding-agent.extraPackages = lib.mkForce [ pkgs.nodejs ];

  home.packages = with pkgs; [
    gh
    fnm
    pnpm
    jq
    ripgrep
    fd
    fzf
    tmux
  ];

  # Lightweight prompt: user@host plus at most three directory segments.
  programs.zsh.initContent = lib.mkAfter ''
    PS1='%F{cyan}%n%f@%F{magenta}%m%f %F{blue}%3~%f %F{green}❯%f '
  '';
}
