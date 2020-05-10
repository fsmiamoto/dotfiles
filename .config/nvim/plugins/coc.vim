let g:coc_global_extensions = ['coc-json', 'coc-tsserver', 'coc-python', 'coc-prettier', 'coc-omni', 'coc-rls', 'coc-snippets', 'coc-go']
let g:coc_snippet_next = '<C-w>'

" Rename current symbol
nmap <leader>rn <Plug>(coc-rename)

nnoremap <leader>cr :CocRestart<CR>
nnoremap <leader>ci :CocInstall

" Remap keys for gotos
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)

" Navigate diagnostics
nmap <silent> <space>k <Plug>(coc-diagnostic-prev)
nmap <silent> <space>j <Plug>(coc-diagnostic-next)

nnoremap <silent> <space>o  :<C-u> CocFzfList outline<CR>
nnoremap <silent> <leader>s :<C-u> CocFzfList -I symbols<CR>
nnoremap <silent> <leader>d :<C-u> CocFzfList diagnostics<CR>


" Use K to show documentation in preview window
nnoremap <silent> K :call <SID>show_documentation()<CR>

" Use <CR> to complete
inoremap <expr> <cr> pumvisible() ? coc#_select_confirm() : "\<C-g>u\<CR>"

" Tab to cycle through completion options
inoremap <expr> <Tab> pumvisible() ? "\<C-n>" : "\<Tab>"
inoremap <expr> <S-Tab> pumvisible() ? "\<C-p>" : "\<S-Tab>"

" Explorer
noremap <F2> :CocCommand explorer<CR>

" Show documentation for symbol
" Opens :help for vim filetypes
function! s:show_documentation()
    if &filetype == 'vim'
        execute 'h '.expand('<cword>')
    else
        call CocAction('doHover')
    endif
endfunction

augroup coc
    autocmd!
    " Close preview window on leaving Insert Mode
    autocmd InsertLeave * if pumvisible() == 0 | silent! pclose | endif
    " Highlight symbol under cursor on CursorHold
    autocmd CursorHold * silent call CocActionAsync('highlight')
augroup END
