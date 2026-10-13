{ config, lib, pkgs, ... }:

let
  nixGcScript = pkgs.writeShellScript "nix-gc" ''
    set -euo pipefail

    ${config.home.profileDirectory}/bin/home-manager expire-generations "-7 days"
    ${pkgs.nix}/bin/nix-collect-garbage -d
  '';
in
# Weekly cleanup: expire old home-manager generations, then GC the nix
# store. Standalone home-manager (no NixOS/nix-darwin `nix.gc`), so this is
# done via the native per-user scheduler on each OS.
lib.mkMerge [
  (lib.mkIf pkgs.stdenv.hostPlatform.isLinux {
    systemd.user.services.nix-gc = {
      Unit.Description = "Expire old home-manager generations and garbage collect the nix store";
      Service = {
        Type = "oneshot";
        ExecStart = "${nixGcScript}";
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
  })

  (lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    launchd.agents.nix-gc = {
      enable = true;
      config = {
        ProgramArguments = [ "${nixGcScript}" ];
        StartCalendarInterval = [
          {
            Weekday = 0;
            Hour = 4;
            Minute = 30;
          }
        ];
        StandardOutPath = "${config.home.homeDirectory}/Library/Logs/nix-gc.log";
        StandardErrorPath = "${config.home.homeDirectory}/Library/Logs/nix-gc.log";
      };
    };
  })
]
