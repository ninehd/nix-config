{
  description = "ninehd's Nix configuration";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    # Dedicated nixpkgs pin for pi only, so pi can be bumped in isolation
    # via `nix flake update nixpkgs-pi` without touching the rest.
    nixpkgs-pi.url = "github:nixos/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };


    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ nixpkgs, home-manager, ... }:
    let
      mkPkgs = system: import nixpkgs {
        inherit system;
        overlays = [ inputs.rust-overlay.overlays.default ];
        # Scope unfree allowance to packages this config needs.
        config.allowUnfreePredicate = pkg: builtins.elem (nixpkgs.lib.getName pkg) [
          "idea"
          "intellij-idea"
          "google-chrome"
          "vscode"
          # pkgs.discord wraps this inner unfree derivation on Linux.
          "discord"
          "discord-unwrapped"
        ];
      };

      mkHome = system: module:
        let
          pkgs = mkPkgs system;
          # pi package from its own pinned nixpkgs, matching the target system.
          pkgs-pi = import inputs.nixpkgs-pi { inherit system; };
        in
        home-manager.lib.homeManagerConfiguration {
          inherit pkgs;
          extraSpecialArgs = { inherit inputs pkgs-pi; };
          modules = [ module ];
        };
    in
    {
      homeConfigurations."endeavour" = mkHome "x86_64-linux" ./hosts/endeavour.nix;

      homeConfigurations."wsl" = mkHome "x86_64-linux" ./hosts/wsl.nix;

      homeConfigurations."debian" = mkHome "x86_64-linux" ./hosts/debian.nix;

      homeConfigurations."mac" = mkHome "aarch64-darwin" ./hosts/mac.nix;
    };
}
