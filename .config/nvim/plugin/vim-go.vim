let g:go_fmt_command = "goimports"  " Run goimports along gofmt on each save
let g:go_doc_keywordprg_enabled = 0 " Disable default mapping to see doc
let g:go_def_mapping_enabled = 0    " Disable default mapping for go to def
let g:go_fold_enable = ['block', 'import']
let g:go_def_mode='gopls'

let g:go_highlight_build_constraints = 1
let g:go_highlight_extra_types = 1
let g:go_highlight_fields = 1
let g:go_highlight_functions = 1
let g:go_highlight_methods = 1
let g:go_highlight_operators = 1
let g:go_highlight_structs = 1
let g:go_highlight_types = 1
let g:go_highlight_function_parameters = 1
let g:go_highlight_function_calls = 1
let g:go_highlight_generate_tags = 1
let g:go_highlight_format_strings = 1
let g:go_highlight_variable_declarations = 1
" let g:go_auto_sameids = 1

augroup go
    autocmd!
    " Go abbreviations
    autocmd FileType go :cabbrev gi GoImport
    autocmd FileType go :cabbrev gd GoDoc
    autocmd FileType go :cabbrev gt GoTest
    autocmd FileType go nnoremap <space>t :GoTest<CR>
augroup END

