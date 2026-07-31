{ config, lib, pkgs, ... }:

{
  config.programs.pi-coding-agent = {
    enable = true;
    extraPackages = [ pkgs.nodejs pkgs.bun pkgs.rtk ];
  };

  config.home.activation.linkPiConfig =
    lib.hm.dag.entryAfter [ "linkGeneration" ] ''
      run mkdir -p "$HOME/.pi/agent"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/settings.json" "$HOME/.pi/agent/settings.json"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/sandbox.json" "$HOME/.pi/agent/sandbox.json"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/extensions" "$HOME/.pi/agent/extensions"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/themes" "$HOME/.pi/agent/themes"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/prompts" "$HOME/.pi/agent/prompts"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/skills" "$HOME/.pi/agent/skills"
    '';
}
