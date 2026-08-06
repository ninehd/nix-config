{ pkgs, ... }:

{
  home.packages = with pkgs; [
    curl
    jq
    ripgrep
    fd
    htop
    xclip
    wl-clipboard # Wayland equivalent of xclip — Claude Code shells out to it to read clipboard images
    uv
    gh
    glab
    pnpm
    fnm # Node version manager — installs/switches Node per-project, no pkgs.nodejs pin here
    maven
    gradle
    vscode
  ];

  programs.bat.enable = true;

  programs.direnv = {
    enable = true;
    enableBashIntegration = true;
    enableZshIntegration = true;
    nix-direnv.enable = true;
  };
}
