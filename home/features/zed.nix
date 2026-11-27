{ pkgs, ... }:

{
  home.packages = [ pkgs.nerd-fonts.jetbrains-mono ];

  programs.zed-editor = {
    enable = true;
    extensions = [ "tokyo-night" "toml" "git-firefly" "emmet" "groovy" ];

    userKeymaps = [
      {
        context = "Editor";
        bindings."ctrl-s" = "workspace::Save";
      }
    ];

    userSettings = {
      terminal = {
        font_family = "JetBrainsMono Nerd Font";
        font_fallbacks = [ "Symbols Nerd Font Mono" ];
        dock = "left";
      };

      agent = {
        favorite_models = [ ];
        model_parameters = [ ];
        enable_feedback = false;
      };
      disable_ai = true;

      telemetry = {
        diagnostics = false;
        metrics = false;
        anthropic_retention = false;
      };

      session.trust_all_worktrees = false;
      base_keymap = "JetBrains";
      helix_mode = true;

      format_on_save = "off";
      languages.Rust.format_on_save = "on";

      icon_theme = {
        mode = "dark";
        light = "Zed (Default)";
        dark = "Zed (Default)";
      };

      agent_servers.pi-acp.type = "registry";
      ui_font_size = 16;
      buffer_font_size = 15;

      theme = {
        mode = "dark";
        light = "Tokyo Night Light";
        dark = "Tokyo Night";
      };
    };
  };
}
