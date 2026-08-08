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

    nixvim = {
      url = "github:nix-community/nixvim";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ nixpkgs, home-manager, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ inputs.rust-overlay.overlays.default ];
        # idea (IntelliJ Ultimate) is unfree; scope the allowance to it
        # instead of a blanket allowUnfree.
        config.allowUnfreePredicate = pkg: builtins.elem (nixpkgs.lib.getName pkg) [
          "idea"
          "google-chrome"
          "vscode"
          "discord"
        ];
      };
      # pi package from its own pinned nixpkgs.
      pkgs-pi = import inputs.nixpkgs-pi { inherit system; };
    in
    {
      homeConfigurations."endeavour" =
        home-manager.lib.homeManagerConfiguration {
          inherit pkgs;
          extraSpecialArgs = { inherit inputs pkgs-pi; };
          modules = [ ./hosts/endeavour.nix ];
        };

      homeConfigurations."wsl" =
        home-manager.lib.homeManagerConfiguration {
          inherit pkgs;
          extraSpecialArgs = { inherit inputs pkgs-pi; };
          modules = [ ./hosts/wsl.nix ];
        };
    };
}