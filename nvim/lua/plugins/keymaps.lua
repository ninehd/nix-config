---@type LazySpec
return {
  {
    "AstroNvim/astrocore",
    ---@type AstroCoreOpts
    opts = {
      mappings = {
        n = {
          ["<Leader>lB"] = { function() require("snacks").picker.diagnostics_buffer() end, desc = "Buffer diagnostics" },
        },
      },
    },
  },
}
