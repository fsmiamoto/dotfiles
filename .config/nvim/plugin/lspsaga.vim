lua << EOF
local saga = require 'lspsaga'
saga.setup {
    finder_action_keys = {
      open = 'o', vsplit = 's',split = 'i',quit = 'q', scroll_down = '<C-f>', scroll_up = '<C-b>' -- quit can be a table
    },
    code_action_keys = {
      quit = '<Esc>',exec = '<CR>'
    },
    rename_action_keys = {
      quit = '<Esc>',exec = '<CR>'  -- quit can be a table
    },
   use_saga_diagnostic_sign = true,
   error_sign = '',
   warn_sign = '',
   hint_sign = '',
   infor_sign = '',
   dianostic_header_icon = '   ',
   code_action_icon = ' ',
   code_action_prompt = {
     enable = true,
     sign = true,
     sign_priority = 20,
     virtual_text = true,
   },
   finder_definition_icon = '  ',
   finder_reference_icon = '  ',
   max_preview_lines = 15, -- preview lines of lsp_finder and definition preview
   definition_preview_icon = '  ',
   -- "single" "double" "round" "plus"
   border_style = "round",
   rename_prompt_prefix = '➤',
}
EOF

nnoremap <silent>K :Lspsaga hover_doc<CR>
nnoremap <leader>rn :Lspsaga rename<CR>
nnoremap <silent> gD :Lspsaga preview_definition<CR>
nnoremap <silent> gd :lua vim.lsp.buf.definition()<CR>
nnoremap <silent> <space>j :Lspsaga diagnostic_jump_next<CR>
nnoremap <silent> <space>k :Lspsaga diagnostic_jump_prev<CR>
nnoremap <silent> gs :Lspsaga lsp_finder<CR>
nnoremap <silent><leader>ca :Lspsaga code_action<CR>
vnoremap <silent><leader>ca :<C-U>Lspsaga range_code_action<CR>
