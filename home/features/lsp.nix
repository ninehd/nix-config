{ pkgs, ... }:

{
  home.packages = with pkgs; [
    bash-language-server
    vscode-langservers-extracted # JSON, HTML, CSS
    yaml-language-server
    taplo # TOML
    ty # Python types and navigation
    ruff # Python lint and fixes
  ];
}
