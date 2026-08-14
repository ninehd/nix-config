---@type LazySpec
return {
  {
    "mrcjkb/rustaceanvim",
    -- workaround: rustaceanvim sends every line of rustlib's lldb_commands
    -- (including blank lines) as codelldb initCommands -> "error: empty command"
    opts = function(_, opts)
      opts.dap = opts.dap or {}
      opts.dap.load_rust_types = false
    end,
  },
}
