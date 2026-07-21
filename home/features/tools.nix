{ pkgs, ... }:

{
  home.packages = with pkgs; [
    curl
    jq
    ripgrep
    fd
    htop
    xclip
    uv
    gh
    pnpm
    fnm # Node version manager — installs/switches Node per-project, no pkgs.nodejs pin here
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
