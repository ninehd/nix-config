{ pkgs, ... }:

{
  home.packages = [ pkgs.nerd-fonts.jetbrains-mono ];

  programs.zed-editor = {
    enable = true;
    extensions = [ "tokyo-night" ];

    userSettings = {
      terminal = {
        font_family = "JetBrainsMono Nerd Font Mono";
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
      vim_mode = true;

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
