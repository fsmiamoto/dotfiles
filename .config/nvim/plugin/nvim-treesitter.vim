lua <<EOF
require'nvim-treesitter.configs'.setup {
  highlight = {
    enable = true,
    ensure_installed = "maintained",
    additional_vim_regex_highlighting = false,
    custom_captures = {
      ["import_spec"] = "Identifier",
    },
  },
}
EOF
