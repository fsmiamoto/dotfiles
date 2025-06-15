-- You can add your own plugins here or in other files in this directory!
--  I promise not to create any merge conflicts in this directory :)
--
-- See the kickstart.nvim README for more information
--

local parser_config = require('nvim-treesitter.parsers').get_parser_configs()

parser_config['ion'] = {
  install_info = {
    url = 'https://github.com/Ignis-lang/tree-sitter-ion.git',
    files = { 'src/parser.c' },
    branch = 'main',
    generate_requires_npm = false,
    requires_generate_from_grammar = true,
  },
  filetype = 'ion',
}

return {}
