{ config, lib, pkgs, ... }:

let
  rustToolchain = pkgs.rust-bin.stable.latest.default.override {
    extensions = [
      "rust-src"
      "rustfmt"
      "clippy"
    ];
    targets = [
      "wasm32-unknown-unknown"
    ];
  };
  rustSrcPath = "${rustToolchain}/lib/rustlib/src/rust/library";
in
{
  options.home.rust.enable = lib.mkEnableOption "Rust toolchain" // { default = true; };

  config = lib.mkIf config.home.rust.enable {
    home.packages = [
      rustToolchain
      pkgs.rust-analyzer
      pkgs.pkg-config
      pkgs.openssl
      pkgs.gcc
    ];

    home.sessionVariables.RUST_SRC_PATH = rustSrcPath;

    # GUI applications on macOS do not inherit Home Manager's shell variables.
    launchd.agents.rust-src-path = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
      enable = true;
      config = {
        ProgramArguments = [ "/bin/launchctl" "setenv" "RUST_SRC_PATH" rustSrcPath ];
        RunAtLoad = true;
      };
    };
  };
}
