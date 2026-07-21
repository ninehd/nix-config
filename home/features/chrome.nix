{ ... }:

{
  # Google Chrome is proprietary: on Linux it only loads external extensions
  # from system-managed directories, which home-manager cannot populate (see
  # the `extensions` assertion in home-manager's chromium.nix module). So,
  # unlike brave.nix, extensions here must be installed manually from the
  # Chrome Web Store.
  programs.google-chrome.enable = true;
}
