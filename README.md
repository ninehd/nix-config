
# nix-config

ninehd's [home-manager](https://github.com/nix-community/home-manager)
flake. Manages the user environment (shell, prompt, terminal, CLI tools) —
the system itself stays managed by the distro (pacman on EndeavourOS).

## Layout

```
flake.nix              # flake entry point, defines hosts
hosts/
  endeavour.nix        # EndeavourOS host (home path, Linux tweaks)
  wsl.nix              # WSL host (home path, drops brave/discord/ghostty)
home/
  common.nix           # shared by every machine
  features/
    terminal.nix       # ghostty (binary + config via Nix) + CLI tools
    starship.nix       # starship prompt (binary + config via Nix)
    zsh.nix            # zsh + antidote + fzf + zoxide (binaries + config via Nix)
    brave.nix          # Brave browser (binary + config via Nix)
    chrome.nix         # Google Chrome (binary only, extensions installed manually)
    git.nix            # git config
    jetbrains.nix      # IntelliJ IDEA Ultimate (binary only)
    discord.nix        # Discord (home.discord.enable toggle, default on)
    ai.nix             # opencode (headless server + CLI wrapper)
    tools.nix          # misc CLI tools (curl, jq, ripgrep, fd, gh, vscode…)
    nixvim.nix         # Neovim configured declaratively (nixvim)
```

## Hosts

- **endeavour** — EndeavourOS, everything enabled.
- **wsl** — WSL (home path `/home/wdhenin`), overrides in `hosts/wsl.nix`:
  Brave and Ghostty forced off (`lib.mkForce false`), Discord off via
  `home.discord.enable = false`. Chrome and JetBrains IDEA stay enabled —
  used directly from WSL rather than through the Windows host.

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
```

New files must be known to git before switching (`git add`), otherwise the
flake won't see them.

## Fresh install

Clone this repo to `~/nix-config` (the path `$FLAKE` expects), then:

```bash
./bootstrap.sh <host>   # endeavour | wsl
```

See the script for details. In short: installs Nix (Determinate), activates
the home-manager config, sets up GPU driver access for Nix-built GUI apps
(`non-nixos-gpu-setup` — needed on non-NixOS so OpenGL/Vulkan apps like
ghostty and Brave get hardware acceleration instead of falling back to
software rendering), then registers the Nix zsh as login shell (`/etc/shells`
+ `chsh`) — the GPU and login-shell steps are system-level and cannot be
managed by home-manager directly.
