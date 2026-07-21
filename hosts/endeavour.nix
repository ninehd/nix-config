{ ... }:

{
  # Machine-specific entry point. Pulls in the shared config, then adds
  # anything unique to EndeavourOS. Right now it's just the Linux home path.
  imports = [
    ../home/common.nix
  ];

  home.homeDirectory = "/home/ninehd";

  targets.genericLinux.enable = true;
  # Linux-only tweaks would go here later (systemd services, etc.).
}