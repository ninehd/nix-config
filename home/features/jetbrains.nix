{ config, lib, pkgs, ... }:

{
  options.home.jetbrains.enable = lib.mkEnableOption "IntelliJ IDEA Ultimate" // { default = true; };

  config = lib.mkIf config.home.jetbrains.enable {
    home.packages = [
      pkgs.jetbrains.idea
    ];
  };
}
