{ config, lib, pkgs, ... }:

let
  neovim = pkgs.neovim.override {
    withNodeJs = true;
    withPython3 = true;
    withRuby = false;
  };
in
{
  # Git comes from host config or external install, not AstroNvim.
  home.packages = with pkgs; [
    neovim

    gcc
    gnumake
    go
    ripgrep
    fd
    unzip

    lua-language-server
    stylua
    nixd
    nixpkgs-fmt
    typescript-language-server
    prettierd
  ];

  home.sessionVariables = {
    EDITOR = "nvim";
    VISUAL = "nvim";
  };

  home.activation.linkNvimConfig =
    lib.hm.dag.entryAfter [ "linkGeneration" ] ''
      run mkdir -p "$HOME/.config"
      if [ -e "$HOME/.config/nvim" ] && [ ! -L "$HOME/.config/nvim" ]; then
        run mv "$HOME/.config/nvim" "$HOME/.config/nvim.bak.$(date +%Y%m%d%H%M%S)"
      fi
      run ln -sfnT "${config.home.homeDirectory}/nix-config/nvim" "$HOME/.config/nvim"
    '';
}
