lua<<EOF
require('fzf-lua').setup{
    height = 0.9,
    width = 0.85,
}

EOF

nnoremap <leader>f :FzfLua files<CR>

nnoremap <leader>k :FzfLua keymaps<CR>

nnoremap <leader>q :FzfLua quickfix<CR>

nnoremap <leader>d :FzfLua lsp_workspace_diagnostics<CR>

nnoremap <leader>gc :FzfLua git_commits<CR>

nnoremap <leader>a :FzfLua command_history<CR>

nnoremap <leader>j :FzfLua jumps<CR>

nnoremap gr :FzfLua lsp_references<CR>

nnoremap <C-f> :FzfLua grep_project<CR>

nnoremap <silent> <space>o :FzfLua lsp_document_symbols<CR>
