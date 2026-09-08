
# nix-config

ninehd's [home-manager](https://github.com/nix-community/home-manager)
flake. Manages the user environment (shell, prompt, terminal, CLI tools) —
the system itself stays managed by the distro (pacman on EndeavourOS).

## Layout

```
flake.nix              # flake entry point, defines hosts
hosts/
  endeavour.nix        # EndeavourOS host (home path, Linux tweaks)
  wsl.nix              # WSL host (home path, drops Linux-only GUI/tools)
  debian.nix           # Minimal CLI-only Debian VM profile
nvim/                  # AstroNvim config linked to ~/.config/nvim
.agents/skills/         # shared pi-coding-agent skills
pi/                    # pi-coding-agent config, extensions, and themes
home/
  common.nix           # shared by every machine
  features/
    terminal.nix       # ghostty (binary + config via Nix) + CLI tools
    starship.nix       # starship prompt (binary + config via Nix)
    zsh.nix            # zsh + antidote + fzf + zoxide (binaries + config via Nix)
    brave.nix          # Brave browser (binary + config via Nix)
    chrome.nix         # Google Chrome (binary only, extensions installed manually)
    git.nix            # git config
    jetbrains.nix      # IntelliJ IDEA Ultimate (home.jetbrains.enable toggle, default on)
    discord.nix        # Discord (home.discord.enable toggle, default on)
    ai.nix             # pi-coding-agent and its config links
    tools.nix          # misc CLI tools (curl, jq, ripgrep, fd, gh, vscode…)
    rust.nix           # Rust toolchain via oxalica/rust-overlay
    astronvim.nix      # Neovim binary/deps via Nix; links nvim/ to ~/.config/nvim
```

## Hosts

- **endeavour** — EndeavourOS, everything enabled.
- **wsl** — WSL (home path `/home/wdhenin`), overrides in `hosts/wsl.nix`:
  Brave, Chrome, and Ghostty forced off (`lib.mkForce false`), Git off via
  `programs.git.enable = lib.mkForce false`, Discord off via
  `home.discord.enable = false`, JetBrains IDEA off via
  `home.jetbrains.enable = false`, Rust off via `home.rust.enable = false`.
- **debian** — minimal Debian VM (`/home/ninehd`) with Zsh, Pi,
  Git/GitHub CLI, `fnm`, `pnpm`, `jq`, `ripgrep`, `fd`, `fzf`, and `tmux`.
  Zsh initializes `fnm` and automatically switches Node from
  `.node-version`/`.nvmrc` files.

## Daily usage

Edit the `.nix` files, then:

```bash
hms   # alias for: home-manager switch --flake $FLAKE
```

`$FLAKE` is set per host (`hosts/*.nix`) to `~/nix-config#<host>`, so the
same alias works on every machine. Spelled out, it's:

```bash
home-manager switch --flake ~/nix-config#endeavour   # EndeavourOS
home-manager switch --flake ~/nix-config#wsl         # WSL
home-manager switch --flake ~/nix-config#debian      # Debian VM
```

New files must be known to git before switching (`git add`), otherwise the
flake won't see them.

## Fresh install

Clone this repo to `~/nix-config` (the path `$FLAKE` expects), then:

```bash
./bootstrap.sh <host>   # endeavour | wsl | debian
```

See the script for details. In short: installs Nix (Determinate), activates
the Home Manager config, sets up GPU driver access for Nix-built GUI apps,
and registers the Nix zsh as login shell. The CLI-only Debian profile only
skips the GPU setup.

