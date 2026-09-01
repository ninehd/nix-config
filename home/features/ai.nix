{ config, lib, pkgs, pkgs-pi, ... }:

{
  config.programs.pi-coding-agent = {
    enable = true;
    # pi itself comes from the dedicated nixpkgs-pi pin (bump in isolation
    # with `nix flake update nixpkgs-pi`). Everything else stays on nixpkgs.
    package = pkgs-pi.pi-coding-agent;
    extraPackages = [ pkgs.nodejs pkgs.bun pkgs.rtk ];
  };

  config.home.activation = {
    linkSharedAgentSkills = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
      run mkdir -p "$HOME/.agents"
      run rm -rf "$HOME/.agents/skills"
      run ln -s "${config.home.homeDirectory}/nix-config/.agents/skills" "$HOME/.agents/skills"
    '';

    linkPiConfig = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
      run mkdir -p "$HOME/.pi/agent"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/settings.json" "$HOME/.pi/agent/settings.json"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/sandbox.json" "$HOME/.pi/agent/sandbox.json"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/extensions" "$HOME/.pi/agent/extensions"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/themes" "$HOME/.pi/agent/themes"
      run ln -sfn "${config.home.homeDirectory}/nix-config/pi/prompts" "$HOME/.pi/agent/prompts"
      run rm -rf "$HOME/.pi/agent/skills"
    '';

    # OpenCode v2 stays manually installed during beta; Home Manager only
    # manages its versioned configuration alongside the existing Pi setup.
    linkOpenCodeConfig = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
      run mkdir -p "$HOME/.config/opencode"

      run ln -sfn "${config.home.homeDirectory}/nix-config/opencode/opencode.jsonc" "$HOME/.config/opencode/opencode.jsonc"
      run ln -sfn "${config.home.homeDirectory}/nix-config/opencode/cli.json" "$HOME/.config/opencode/cli.json"
      run ln -sfn "${config.home.homeDirectory}/nix-config/opencode/agents" "$HOME/.config/opencode/agents"
      run ln -sfn "${config.home.homeDirectory}/nix-config/opencode/commands" "$HOME/.config/opencode/commands"
      run ln -sfn "${config.home.homeDirectory}/nix-config/opencode/plugins" "$HOME/.config/opencode/plugins"
      run rm -rf "$HOME/.config/opencode/skills"
    '';
  };
}
