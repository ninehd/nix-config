---@type LazySpec
return {
  {
    "rebelot/heirline.nvim",
    opts = function(_, opts)
      local status = require "astroui.status"

      local mode_names = {
        n = "N",
        no = "N?",
        nov = "N?",
        noV = "N?",
        ["no\22"] = "N?",
        niI = "Ni",
        niR = "Nr",
        niV = "Nv",
        nt = "Nt",
        v = "V",
        vs = "Vs",
        V = "V_",
        Vs = "Vs",
        ["\22"] = "^V",
        ["\22s"] = "^V",
        s = "S",
        S = "S_",
        ["\19"] = "^S",
        i = "I",
        ic = "Ic",
        ix = "Ix",
        R = "R",
        Rc = "Rc",
        Rx = "Rx",
        Rv = "Rv",
        Rvc = "Rv",
        Rvx = "Rv",
        c = "C",
        cv = "Ex",
        r = "...",
        rm = "M",
        ["r?"] = "?",
        ["!"] = "!",
        t = "T",
      }

      local mode_label = status.component.builder {
        {
          provider = function() return mode_names[vim.fn.mode(1)] or "?" end,
          hl = function() return require("astroui.status.hl").get_attributes "mode" end,
          update = {
            "ModeChanged",
            pattern = "*:*",
            callback = vim.schedule_wrap(function() vim.cmd "redrawstatus" end),
          },
        },
        padding = { left = 1, right = 1 },
        surround = {
          separator = "left",
          color = function() return require("astroui.status.hl").mode_bg() end,
          update = { "ModeChanged", pattern = "*:*" },
        },
      }

      opts.statusline = {
        hl = { fg = "fg", bg = "bg" },

        mode_label,
        status.component.git_branch(),

        status.component.file_info(),
        status.component.git_diff(),
        status.component.diagnostics(),
        status.component.fill(),
        status.component.cmd_info(),
        status.component.fill(),
        status.component.lsp(),
        status.component.virtual_env(),
        status.component.treesitter(),
        status.component.nav(),
      }
    end,
  },
}
