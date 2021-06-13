let g:floaterm_autoinsert=1
let g:floaterm_width=0.9
let g:floaterm_height=0.9
let g:floaterm_wintitle=0
let g:floaterm_autoclose=1

let g:lf_map_keys = 0

nnoremap <space>lg :FloatermNew lazygit<CR>
nnoremap <space>lf :Lf<CR>
nnoremap <space>ck :FloatermNew ck -w<CR>

