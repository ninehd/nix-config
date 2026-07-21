
# nix-config

ninehd's [home-manager](https://github.com/nix-community/home-manager)
flake. Manages the user environment (shell, prompt, terminal, CLI tools) —
the system itself stays managed by the distro (pacman on EndeavourOS).

## Layout

```
flake.nix              # flake entry point, defines hosts
hosts/
  endeavour.nix        # EndeavourOS host (home path, Linux tweaks)
home/
  common.nix           # shared by every machine
  features/
    terminal.nix       # ghostty (binary + config via Nix) + CLI tools
    starship.nix       # starship prompt (binary + config via Nix)
    zsh.nix            # zsh + antidote + fzf + zoxide (binaries + config via Nix)
    brave.nix         # Brave browser (binary + config via Nix)
```

## Daily usage

Edit the `.nix` files, then:

```bash
home-manager switch --flake ~/github/nix-config#endeavour
```

New files must be known to git before switching (`git add`), otherwise the
flake won't see them.

## Fresh install

Clone this repo to `~/github/nix-config`, then:

```bash
./bootstrap.sh
```

See the script for details. In short: installs Nix (Determinate), activates
the home-manager config, sets up GPU driver access for Nix-built GUI apps
(`non-nixos-gpu-setup` — needed on non-NixOS so OpenGL/Vulkan apps like
ghostty and Brave get hardware acceleration instead of falling back to
software rendering), then registers the Nix zsh as login shell (`/etc/shells`
+ `chsh`) — the GPU and login-shell steps are system-level and cannot be
managed by home-manager directly.
