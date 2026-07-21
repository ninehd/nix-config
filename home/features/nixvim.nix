{ inputs, lib, pkgs, ... }:

{
  imports = [
    inputs.nixvim.homeModules.nixvim
  ];

  programs.nixvim = {
    enable = true;

    # Nixvim pins its own nixpkgs, but flake.nix makes it follow ours instead
    # (same reasoning as home-manager) to avoid a second nixpkgs in the closure.
    nixpkgs.source = pkgs.path;

    # Default settings
    opts = {
      number = lib.mkDefault true;
      relativenumber = lib.mkDefault true;
      shiftwidth = lib.mkDefault 2;
      tabstop = lib.mkDefault 2;
      expandtab = lib.mkDefault true;
      smartindent = lib.mkDefault true;
      wrap = lib.mkDefault false;
      cursorline = lib.mkDefault false; # Fixes ghostty/tmux scrolling artifacts
      colorcolumn = lib.mkDefault "120";
    };

    # Dimmer than the theme default so the colorcolumn reads as a subtle guide,
    # not a solid highlighted line.
    highlight.ColorColumn.bg = lib.mkDefault "#1e2030";

    # Enable clipboard integration
    clipboard.register = lib.mkDefault "unnamedplus";

    # Color scheme
    colorschemes.tokyonight = {
      enable = lib.mkDefault true;
      settings = {
        style = lib.mkDefault "night";
      };
    };

    # Useful default plugins
    plugins = {
      # Icons (required by neo-tree and others)
      web-devicons.enable = lib.mkDefault true;

      # File tree
      neo-tree = {
        enable = lib.mkDefault true;
        settings.filesystem.hijack_netrw_behavior = lib.mkDefault "open_current";
      };

      # Fuzzy finder
      telescope = {
        enable = lib.mkDefault true;
        extensions.fzf-native.enable = lib.mkDefault true;
      };

      # LSP
      lsp = {
        enable = lib.mkDefault true;
        servers = {
          nixd.enable = lib.mkDefault true;
          lua_ls.enable = lib.mkDefault true;
        };
      };

      # Completion
      cmp = {
        enable = lib.mkDefault true;
        autoEnableSources = lib.mkDefault true;
        settings.sources = [
          { name = lib.mkDefault "nvim_lsp"; }
          { name = lib.mkDefault "buffer"; }
          { name = lib.mkDefault "path"; }
        ];
      };

      # Syntax highlighting
      treesitter = {
        enable = lib.mkDefault true;
        settings.highlight.enable = lib.mkDefault true;
      };

      # Status line
      lualine.enable = lib.mkDefault true;

      # Git integration
      gitsigns.enable = lib.mkDefault true;

      # Auto pairs
      nvim-autopairs.enable = lib.mkDefault true;

      # Comment helper
      comment.enable = lib.mkDefault true;

      # Buffer line (tabs)
      bufferline.enable = lib.mkDefault true;

      # Indent guides
      indent-blankline = {
        enable = lib.mkDefault true;
        settings.exclude.filetypes = lib.mkDefault [
          "dashboard"
          "neo-tree"
          "lazy"
          "mason"
        ];
      };

      # Keybinding popup (LazyVim-style leader menu)
      which-key.enable = lib.mkDefault true;

      # Format-on-save
      conform-nvim = {
        enable = lib.mkDefault true;
        autoInstall.enable = lib.mkDefault true;
        settings = {
          format_on_save = lib.mkDefault {
            timeout_ms = 500;
            lsp_format = "fallback";
          };
          formatters_by_ft = lib.mkDefault {
            nix = [ "nixpkgs_fmt" ];
            lua = [ "stylua" ];
          };
        };
      };

      # Pretty diagnostics/references list
      trouble.enable = lib.mkDefault true;

      # Start screen
      dashboard.enable = lib.mkDefault true;
    };

    # Keymaps
    globals = {
      mapleader = lib.mkDefault " ";
      maplocalleader = lib.mkDefault "\\";
    };

    keymaps = [
      # File explorer
      {
        key = "<leader>e";
        action = "<cmd>Neotree toggle<cr>";
        options.desc = lib.mkDefault "Toggle file explorer";
      }
      # Find files
      {
        key = "<leader>ff";
        action = "<cmd>Telescope find_files<cr>";
        options.desc = lib.mkDefault "Find files";
      }
      # Live grep
      {
        key = "<leader>fg";
        action = "<cmd>Telescope live_grep<cr>";
        options.desc = lib.mkDefault "Live grep";
      }
      # Buffers
      {
        key = "<leader>fb";
        action = "<cmd>Telescope buffers<cr>";
        options.desc = lib.mkDefault "Find buffers";
      }
      # Format buffer
      {
        key = "<leader>cf";
        action.__raw = "function() require('conform').format({ lsp_format = 'fallback' }) end";
        options.desc = lib.mkDefault "Format buffer";
      }
      # Diagnostics list
      {
        key = "<leader>xx";
        action = "<cmd>Trouble diagnostics toggle<cr>";
        options.desc = lib.mkDefault "Diagnostics (Trouble)";
      }
      # Buffer diagnostics list
      {
        key = "<leader>xX";
        action = "<cmd>Trouble diagnostics toggle filter.buf=0<cr>";
        options.desc = lib.mkDefault "Buffer diagnostics (Trouble)";
      }
    ];
  };
}
