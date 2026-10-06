return {
  "OXY2DEV/markview.nvim",
  lazy = false, -- recommandé par le projet
  dependencies = {
    "nvim-treesitter/nvim-treesitter",
    "nvim-tree/nvim-web-devicons",
  },
  config = function() require("markview").setup() end,
}
