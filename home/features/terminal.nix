{ pkgs, lib, ... }:

{
  fonts.fontconfig.enable = true; # so fontconfig picks up fonts from the nix profile (needed for IntelliJ's terminal)

  home.packages = with pkgs; [
    jetbrains-mono # font used by ghostty's settings.font-family below
    nerd-fonts.symbols-only # nerd font icons fallback, needed for IntelliJ terminal (Ghostty falls back to this automatically already)
  ];

  # Two built-in ghostty themes (see `ghostty +list-themes`), selected via the
  # `theme-active.conf` symlink below. Toggle with `ghostty-dark`/`ghostty-light`
  # shell functions, then reload with the default ctrl+shift+, keybind.
  home.file.".config/ghostty/themes/dark.conf".text = ''
    theme = TokyoNight Night
  '';

  home.file.".config/ghostty/themes/light.conf".text = ''
    theme = Dayfox
  '';

  # theme-active.conf is a mutable symlink, not managed by home-manager directly,
  # so switching themes at runtime survives future `home-manager switch` runs.
  # Only created if missing, defaulting to dark.
  home.activation.ghosttyThemeDefault = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    target="$HOME/.config/ghostty/theme-active.conf"
    [ -e "$target" ] || ln -sf "$HOME/.config/ghostty/themes/dark.conf" "$target"
  '';

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

      # Color scheme, see themes/dark.conf and themes/light.conf above
      config-file = "theme-active.conf";
    };
  };
}
