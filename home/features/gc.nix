{ config, lib, pkgs, ... }:

# Weekly cleanup: expire old home-manager generations, then GC the nix
# store. Standalone home-manager (no NixOS `nix.gc`), so this is done
# via a systemd user timer instead.
lib.mkIf pkgs.stdenv.isLinux {
  systemd.user.services.nix-gc = {
    Unit.Description = "Expire old home-manager generations and garbage collect the nix store";
    Service = {
      Type = "oneshot";
      ExecStart = "${pkgs.writeShellScript "nix-gc" ''
        ${config.home.profileDirectory}/bin/home-manager expire-generations "-7 days"
        ${pkgs.nix}/bin/nix-collect-garbage -d
      ''}";
    };
  };

  systemd.user.timers.nix-gc = {
    Unit.Description = "Weekly nix garbage collection";
    Timer = {
      OnCalendar = "weekly";
      Persistent = true;
    };
    Install.WantedBy = [ "timers.target" ];
  };
}
