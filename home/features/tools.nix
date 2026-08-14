{ config, lib, pkgs, ... }:

{
  options.home.mavenGradle.enable =
    lib.mkEnableOption "Maven and Gradle" // { default = true; };

  config = {
    home.packages = with pkgs;
      [
        curl
        jq
        ripgrep
        fd
        htop
        btop
        xclip
        wl-clipboard # Wayland equivalent of xclip — Claude Code shells out to it to read clipboard images
        uv
        gh
        glab
        lazygit
        pnpm
        fnm # Node version manager — installs/switches Node per-project, no pkgs.nodejs pin here
        vscode
      ]
      ++ lib.optionals config.home.mavenGradle.enable [
        maven
        gradle
      ];

    programs.bat.enable = true;

    programs.direnv = {
      enable = true;
      enableBashIntegration = true;
      enableZshIntegration = true;
      nix-direnv.enable = true;
    };
  };
}
