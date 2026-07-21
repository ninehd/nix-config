{ pkgs, ... }:

{
  home.packages = with pkgs; [
    ripgrep
    fd
    jetbrains-mono # font used by ghostty's settings.font-family below
  ];

  programs.ghostty = {
    enable = true;

    settings = {
      # Font
      font-family = "Jetbrains Mono";
      font-size = 12;

      # Window
      window-padding-x = 14;
      window-padding-y = 14;
      window-decoration = false;
      background-opacity = 0.98;

      # Terminal
      term = "xterm-256color";

      # Keybindings
      keybind = "f11=toggle_fullscreen";

      # Color scheme from omarchy theme
      background = "1a1b26";
      foreground = "a9b1d6";
      selection-background = "292e42";
      selection-foreground = "c0caf5";

      # Normal colors (0-7) + bright colors (8-15)
      palette = [
        "0=#0e0e14"
        "1=#f7768e"
        "2=#9ece6a"
        "3=#e0af68"
        "4=#7aa2f7"
        "5=#ad8ee6"
        "6=#449dab"
        "7=#a9b1d6"
        "8=#414868"
        "9=#ff7a93"
        "10=#b9f27c"
        "11=#ff9e64"
        "12=#7da6ff"
        "13=#bb9af7"
        "14=#0db9d7"
        "15=#c0caf5"
      ];
    };
  };
}
