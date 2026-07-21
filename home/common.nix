{ ... }:

{
  # Shared by every machine (Linux today, Mac tomorrow).
  # NOTE: homeDirectory is NOT set here — it differs per OS
  # (/home/... on Linux, /Users/... on macOS), so each host sets its own.
  imports = [
    ./features/terminal.nix
    ./features/starship.nix
    ./features/zsh.nix
    ./features/brave.nix
    ./features/chrome.nix
    ./features/git.nix
    ./features/jetbrains.nix
    ./features/discord.nix
    ./features/ai.nix
    ./features/tools.nix
  ];

  home.username = "ninehd";

  # Reference release for this config's initial state.
  # Do NOT bump casually — read the release notes first.
  home.stateVersion = "25.05";

  programs.home-manager.enable = true;
}