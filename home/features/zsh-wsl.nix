{ lib, ... }:

{
  programs.zsh = {
    # No `open` under WSL -- Windows Explorer opens the current directory.
    shellAliases.xx = lib.mkForce "/mnt/c/Windows/explorer.exe .";

    sessionVariables = {
      XCURSOR_SIZE = 16;

      # Mirrored networking shares the Windows host's loopback, so X410 is
      # reachable over plain TCP -- no VSOCK/socat relay.
      DISPLAY = "127.0.0.1:0.0";
      XDG_CURRENT_DESKTOP = "X410";
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
