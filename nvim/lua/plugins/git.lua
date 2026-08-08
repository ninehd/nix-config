---@type LazySpec
return {
  {
    "sindrets/diffview.nvim",
    keys = {
      { "<Leader>gD", "<Cmd>DiffviewOpen<CR>", desc = "Diffview open" },
      { "<Leader>gH", "<Cmd>DiffviewFileHistory<CR>", desc = "Diffview history" },
      { "<Leader>gQ", "<Cmd>DiffviewClose<CR>", desc = "Diffview close" },
    },
  },
}
