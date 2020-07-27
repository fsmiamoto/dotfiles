set rtp +=~/.fzf

let g:fzf_colors =
            \ { 'fg':      ['fg', 'Normal'],
            \ 'bg':      ['bg', 'Normal'],
            \ 'hl':      ['fg', 'Comment'],
            \ 'fg+':     ['fg', 'CursorLine', 'CursorColumn', 'Normal'],
            \ 'bg+':     ['bg', 'CursorLine', 'CursorColumn'],
            \ 'hl+':     ['fg', 'Statement'],
            \ 'info':    ['fg', 'PreProc'],
            \ 'border':  ['fg', 'Ignore'],
            \ 'prompt':  ['fg', 'Conditional'],
            \ 'pointer': ['fg', 'Exception'],
            \ 'marker':  ['fg', 'Keyword'],
            \ 'spinner': ['fg', 'Label'],
            \ 'header':  ['fg', 'Comment'] }

let g:fzf_layout = { 'window': { 'width': 0.95, 'height': 0.9 } }

" Preview window
command! -bang -nargs=? -complete=dir Files
            \ call fzf#vim#files(<q-args>, fzf#vim#with_preview(), <bang>0)

" Search for files in the current directory
nnoremap <leader>f :Files .<CR>

" Search for buffers
nnoremap <leader>b :Buffers<CR>

" Search for lines
nnoremap <space>f :BLines<CR>
nnoremap <space>F :Lines<CR>

" Search for mappings
nnoremap <leader>m :Maps<CR>

" Search for filetypes
nnoremap <leader>t :Filetypes<CR>

nnoremap <C-f> :Rg<CR>
nnoremap <space>h :Rg <C-R>=expand("<cword>")<CR><CR>
