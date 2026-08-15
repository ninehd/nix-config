{ config, lib, pkgs, ... }:

{
  options.home.rust.enable = lib.mkEnableOption "Rust toolchain" // { default = true; };

  config = lib.mkIf config.home.rust.enable {
    home.packages = [
      (pkgs.rust-bin.stable.latest.default.override {
        extensions = [
          "rust-src"
          "rustfmt"
          "clippy"
        ];
        targets = [
          "wasm32-unknown-unknown"
        ];
      })
      pkgs.rust-analyzer
      pkgs.pkg-config
      pkgs.openssl
      pkgs.gcc
    ];
  };
}
