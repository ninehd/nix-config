{ ... }:

{
  # Plain pkgs.brave for now. If GPU/OpenGL turns out broken on this
  # non-NixOS box (same class of issue documented for ghostty in the
  # README), wrap it with nixGL instead of switching to package = null.
  programs.brave = {
    enable = true;

    extensions = [
      { id = "cimiefiiaegbelhefglklhhakcgmhkai"; } # Plasma Integration
      { id = "eiaeiblijfjekdanodkjadfinkhbfgcd"; } # NordPass Password Manager
      { id = "mihcahmgecmbnbcchbopgniflfhgnkff"; } # Google Mail Checker
    ];
  };
}
