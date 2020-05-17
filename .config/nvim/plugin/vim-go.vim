let g:go_fmt_command = "goimports"  " Run goimports along gofmt on each save
let g:go_doc_keywordprg_enabled = 0 " Disable default mapping to see doc
let g:go_def_mapping_enabled = 0    " Disable default mapping for go to def
let g:go_fold_enable = ['block', 'import']
let g:go_def_mode='gopls'

augroup go
    autocmd!
    " Go abbreviations
    autocmd FileType go :cabbrev gi GoImport
    autocmd FileType go :cabbrev gd GoDoc
    autocmd FileType go :cabbrev gt GoTest
    autocmd FileType go nnoremap <space>t :GoTest<CR>
augroup END

