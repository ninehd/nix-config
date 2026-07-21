{ ... }:

let
  # Raw backspace control char (0x08) used by starship's powerline-style
  # separators below — Nix has no \b string escape.
  bs = "";
in
{
  # Starship IS installed by Nix (programs.starship.package defaults to
  # pkgs.starship). Since zsh is managed too (features/zsh.nix), the default
  # enableZshIntegration = true injects `starship init zsh` into .zshrc.
  programs.starship = {
    enable = true;

    settings = {
      "$schema" = "https://starship.rs/config-schema.json";

      format = "$username$hostname$directory$git_branch$git_commit$git_state$git_status$time$line_break$python$character";

      palette = "tokyo_night";

      palettes.tokyo_night = {
        color_bg = "#1a1b26";
        color_fg0 = "#c0caf5";
        color_blue = "#7aa2f7";
        color_purple = "#bb9af7";
        color_green = "#9ece6a";
        color_red = "#f38ba8";
        color_orange = "#ff9e64";
      };

      directory = {
        style = "fg:color_green";
        format = "[$path ]($style)";
        truncation_length = 3;
        truncation_symbol = "…/";
        substitutions = {
          "Documents" = "󰈙 ";
          "Downloads" = " ";
          "Music" = "󰝚 ";
          "Pictures" = " ";
          "Developer" = "󰲋 ";
        };
      };

      character = {
        success_symbol = "[❯](purple)";
        error_symbol = "[❯](red)";
        vimcmd_symbol = "[❮](green)";
      };

      git_branch = {
        symbol = "";
        style = "";
        format = "on [[$symbol $branch ](fg:color_red)]($style)";
      };

      git_commit = {
        style = "";
        format = "${bs}[ ](bg:$style)[\\($hash$tag\\)](fg:color_red bg:$style)";
      };

      git_state = {
        style = "";
        format = "${bs}[ ](bg:$style)[ \\($state( $progress_current/$progress_total)\\)](fg:color_red bg:$style)";
      };

      git_status = {
        style = "";
        format = "(${bs}[ ](bg:$style fg:color_red)$conflicted$staged$modified$renamed$deleted$untracked$ahead_behind$stashed($style))";
        conflicted = "[ ](bold fg:color_red)[  \${count} ](fg:color_red)";
        staged = "[ $count ](fg:color_red)";
        modified = "[󰏫 \${count} ](fg:color_red)";
        renamed = "[ \${count} ](fg:color_red)";
        deleted = "[ \${count} ](fg:color_red)";
        untracked = "[ \${count} ](fg:color_red)";
        stashed = "[ \${count} ](fg:color_red)";
        ahead = "[ \${count} ](fg:color_red)";
        behind = "[ \${count} ](fg:color_red)";
        diverged = "[ ](fg:color_red)[ נּ ](fg:color_red)[ \${ahead_count} ](fg:color_red)[ \${behind_count} ](fg:color_red)";
      };

      cmd_duration = {
        format = "[$duration]($style) ";
        style = "yellow";
      };

      python = {
        format = "[$virtualenv]($style) ";
        style = "bright-black";
        detect_extensions = [ ];
        detect_files = [ ];
      };

      time = {
        disabled = false;
        time_format = "%R";
        format = "[at $time ](fg:color_fg0)";
      };

      username = {
        show_always = true;
        style_user = "fg:color_blue";
        format = "[$user]($style) in ";
      };
    };
  };
}
