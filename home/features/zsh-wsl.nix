{ lib, ... }:

{
  programs.zsh = {
    # No `open` under WSL -- Windows Explorer opens the current directory.
    shellAliases.xx = lib.mkForce "/mnt/c/Windows/explorer.exe .";

    sessionVariables = {
      XCURSOR_SIZE = 16;

      # WSLg provides DISPLAY/WAYLAND_DISPLAY/PULSE_SERVER dynamically.
      # Don't override them here.

      # Windows Terminal isn't auto-detected by pi's startup extension.
      # Force Nerd Font glyphs when the Windows-side terminal font supports them.
      FOOTER_NERD_FONTS = "1";
    };

    initContent = ''
      # ---- User environment -------------------------------------------------------
      # Personal environment variables
      [[ -f ~/.env ]] && source ~/.env
      [[ -f ~/.bash_aliases ]] && source ~/.bash_aliases
      unset WSL_DISTRO_NAME
    '';
  };
}
