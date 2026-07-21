{
  description = "ninehd's Nix configuration";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, home-manager, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        # idea (IntelliJ Ultimate) is unfree; scope the allowance to it
        # instead of a blanket allowUnfree.
        config.allowUnfreePredicate = pkg: builtins.elem (nixpkgs.lib.getName pkg) [
          "idea"
        ];
      };
    in
    {
      homeConfigurations."endeavour" =
        home-manager.lib.homeManagerConfiguration {
          inherit pkgs;
          modules = [ ./hosts/endeavour.nix ];
        };
    };
}