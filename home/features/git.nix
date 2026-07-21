{ ... }:

{
  programs.git = {
    enable = true;

    ignores = [
      ".idea/"
      ".DS_Store"
      ".claude"
    ];

    settings = {
      user = {
        name = "ninehd";
        email = "13874932+ninehd@users.noreply.github.com";
        signingkey = "245CACAE2F1F447E";
      };

      alias = {
        co = "checkout";
        st = "status --short --branch";
        sw = "switch";
      };

      color.ui = "auto";
      commit.gpgsign = false;
      core.pager = "less";
      diff.colorMoved = "default";
      init.defaultBranch = "main";
      pull.rebase = true;
      push.autoSetupRemote = true;
      rebase.autoStash = true;
    };
  };
}
