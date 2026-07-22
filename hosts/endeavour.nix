{ config, ... }:

{
  # Machine-specific entry point. Pulls in the shared config, then adds
  # anything unique to EndeavourOS. Right now it's just the Linux home path.
  imports = [
    ../home/common.nix
  ];

  home.username = "ninehd";
  home.homeDirectory = "/home/ninehd";

  targets.genericLinux.enable = true;

  # Target of the `hms` alias (see home/features/zsh.nix).
  home.sessionVariables.FLAKE = "${config.home.homeDirectory}/nix-config#endeavour";

  # Linux-only tweaks would go here later (systemd services, etc.).
}