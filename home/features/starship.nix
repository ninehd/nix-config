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

      # No custom hex palette: styles below use the 16 standard ANSI color
      # names, so the prompt follows whichever ghostty theme is active
      # (dark/light) instead of being locked to fixed hex values.

      directory = {
        style = "fg:green";
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
        format = "on [[$symbol $branch ](fg:blue)]($style)";
      };

      git_commit = {
        style = "";
        format = "${bs}[ ](bg:$style)[\\($hash$tag\\)](fg:red bg:$style)";
      };

      git_state = {
        style = "";
        format = "${bs}[ ](bg:$style)[ \\($state( $progress_current/$progress_total)\\)](fg:red bg:$style)";
      };

      git_status = {
        style = "";
        format = "(${bs}[ ](bg:$style fg:red)[\\[$conflicted$staged$modified$renamed$deleted$untracked$ahead_behind$stashed${bs}\\]](fg:red) )";
        conflicted = "[ ](bold fg:red)[ \${count} ](fg:red)";
        staged = "[ \$count ](fg:red)";
        modified = "[󰏫 \${count} ](fg:red)";
        renamed = "[ \${count} ](fg:red)";
        deleted = "[ \${count} ](fg:red)";
        untracked = "[ \${count} ](fg:red)";
        stashed = "[ \${count} ](fg:red)";
        ahead = "[ \${count} ](fg:red)";
        behind = "[ \${count} ](fg:red)";
        diverged = "[ ](fg:red)[ נּ ](fg:red)[ \${ahead_count} ](fg:red)[ \${behind_count} ](fg:red)";
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
        format = "[at $time ](fg:purple)";
      };

      username = {
        show_always = true;
        style_user = "fg:bright-cyan";
        format = "[$user]($style) in ";
      };
    };
  };
}
