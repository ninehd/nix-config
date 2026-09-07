{ config, lib, pkgs, ... }:

{
  # Minimal command-line environment for the Debian VM.
  imports = [
    ../home/features/ai.nix
    ../home/features/git.nix
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

  home.sessionVariables.FLAKE = "${config.home.homeDirectory}/nix-config#debian";

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

  # Keep Debian's Bash as the login shell and let fnm select Node versions,
  # including automatic project switching via .node-version/.nvmrc files.
  programs.bash = {
    enable = true;
    enableCompletion = false;
    shellAliases.hms = "home-manager switch --flake $FLAKE";
    initExtra = ''
      eval "$(fnm env --use-on-cd --shell bash)"
    '';
  };
}
