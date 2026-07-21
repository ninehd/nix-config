{ config, lib, pkgs, ... }:

{
  # No real home-manager module for Discord, so we roll our own enable
  # switch (default on) so hosts like wsl.nix can opt out.
  options.home.discord.enable = lib.mkEnableOption "Discord" // { default = true; };

  config = lib.mkIf config.home.discord.enable {
    home.packages = [
      pkgs.discord
    ];
  };
}
