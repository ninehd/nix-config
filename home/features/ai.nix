{ config, lib, pkgs, ... }:

let
  hostname = config.ai.opencode.hostname;
  real = pkgs.opencode;

  # Bare `opencode` attaches to the shared background service instead of
  # starting its own local TUI instance (the binary's default action).
  # Any subcommand (run, serve, auth, …) passes through unchanged.
  opencode-wrapper = pkgs.writeShellScriptBin "opencode" ''
    if [ $# -gt 0 ]; then
      exec ${real}/bin/opencode "$@"
    fi
    exec ${real}/bin/opencode attach http://localhost:4096 --dir "$PWD"
  '';
in
{
  options.ai.opencode.hostname = lib.mkOption {
    type = lib.types.str;
    default = "127.0.0.1";
    description = "Hostname for opencode's web server to bind to (default: localhost only). Set to \"0.0.0.0\" for LAN access.";
  };

  config.programs.pi-coding-agent = {
    enable = true;
    extraPackages = [ pkgs.nodejs pkgs.bun ];
  };

  config.programs.opencode = {
    enable = true;
    package = opencode-wrapper;

    # Headless server — always running (systemd.user.services.opencode-web,
    # bound to default.target, so it starts on both EndeavourOS and WSL).
    web = {
      enable = true;
      extraArgs = [
        "--hostname"
        hostname
        "--port"
        "4096"
      ];
    };
  };
}
