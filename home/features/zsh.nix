{ config, ... }:

{
  # ~/.local/bin: claude, kitty… ; pi-node: node/npm/pi. Appended to PATH —
  # fine since none of these names collide with system binaries. Drop each
  # entry when the tool moves to home.packages.
  home.sessionPath = [
    "${config.home.homeDirectory}/.local/bin"
    "${config.home.homeDirectory}/.local/share/pi-node/node-v22.23.1-linux-x64/bin"
  ];

  # The login shell stays /usr/bin/zsh (pacman) — chsh is untouched. Nix also
  # installs its own zsh (programs.zsh.package isn't nullable) but that only
  # affects `zsh` invocations from PATH, not login.
  programs.zsh = {
    enable = true;

    # compinit is handled by the ez-compinit plugin below; home-manager's own
    # `autoload -U compinit && compinit` would run it a second time, after
    # fzf-tab has already loaded.
    enableCompletion = false;

    shellAliases = {
      # $FLAKE (path#config) is set per host — see hosts/*.nix.
      hms = "home-manager switch --flake $FLAKE";
      xx = "open .";
      ll = "ls -lha";
      vim = "nvim";
      vi = "nvim";
    };

    sessionVariables = {
      # Interval (seconds) for the ohmyzsh git-auto-fetch plugin
      GIT_AUTO_FETCH_INTERVAL = 1200;
    };

    history = {
      extended = true; # timestamp each entry
      ignoreAllDups = true; # drop older duplicates
      ignoreSpace = true; # commands starting with a space aren't recorded
      share = false; # belak used INC_APPEND_HISTORY, not SHARE_HISTORY
    };

    antidote = {
      enable = true;
      plugins = [
        # --- Completions core ---
        "mattmc3/ez-compinit"
        "zsh-users/zsh-completions kind:fpath path:src"

        # --- FZF completion UI ---
        # Must load right after compinit, but before any plugin that wraps zle
        # widgets (zsh-autosuggestions, fast-syntax-highlighting), or tab stops
        # producing completions. See Aloxaf/fzf-tab README "Install" note #2.
        "Aloxaf/fzf-tab"

        # --- Libraries & utilities ---
        "ohmyzsh/ohmyzsh path:lib"
        "belak/zsh-utils path:utility"
        "ohmyzsh/ohmyzsh path:plugins/extract"
        "ohmyzsh/ohmyzsh path:plugins/git"
        "ohmyzsh/ohmyzsh path:plugins/git-auto-fetch"

        # --- Syntax & suggestions (order matters) ---
        "zdharma-continuum/fast-syntax-highlighting"
        "zsh-users/zsh-autosuggestions"
      ];
    };

    # Only what has no typed home-manager option: dynamic per-shell values,
    # zstyles, and zle widget code.
    initContent = ''
      # fnm needs its env eval'd in each shell to manage PATH/Node version;
      # --use-on-cd auto-switches on .nvmrc/.node-version when entering a dir.
      eval "$(fnm env --use-on-cd)"

      ### --- fzf-tab settings ---
      zstyle ':completion:*:git-checkout:*' sort false
      zstyle ':completion:*:descriptions' format '[%d]'
      zstyle ':completion:*' list-colors ''${(s.:.)LS_COLORS}
      zstyle ':completion:*' menu no
      zstyle ':fzf-tab:*' fzf-pad 4
      zstyle ':fzf-tab:*' fzf-flags --color=fg:1,fg+:2 --bind='tab:accept'
      zstyle ':fzf-tab:*' accept-line enter
      zstyle ':fzf-tab:*' use-fzf-default-opts yes
      zstyle ':fzf-tab:*' switch-group '<' '>'

      # This speeds up pasting w/ autosuggest
      # https://github.com/zsh-users/zsh-autosuggestions/issues/238
      pasteinit() {
        OLD_SELF_INSERT=''${''${(s.:.)widgets[self-insert]}[2,3]}
        zle -N self-insert url-quote-magic
      }

      pastefinish() {
        zle -N self-insert $OLD_SELF_INSERT
      }
      zstyle :bracketed-paste-magic paste-init pasteinit
      zstyle :bracketed-paste-magic paste-finish pastefinish

      # Manual light/dark toggle for ghostty (see home/features/terminal.nix).
      # Flips the theme-active.conf symlink; press ctrl+shift+, in ghostty to reload.
      ghostty-dark() { ln -sf "$HOME/.config/ghostty/themes/dark.conf" "$HOME/.config/ghostty/theme-active.conf"; }
      ghostty-light() { ln -sf "$HOME/.config/ghostty/themes/light.conf" "$HOME/.config/ghostty/theme-active.conf"; }
    '';
  };

  # fzf binary now comes from Nix; enableZshIntegration (default true) replaces
  # the manual `source <(fzf --zsh)` for Ctrl-R / Ctrl-T / Alt-C widgets.
  programs.fzf = {
    enable = true;
    defaultOptions = [
      "--height 40%"
      "--layout=reverse"
      "--border"
    ];
    defaultCommand = "find .";
  };

  programs.zoxide = {
    enable = true;
    enableZshIntegration = true;
  };
}
