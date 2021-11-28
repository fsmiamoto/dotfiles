autocmd FileType go :silent! lua require('go').setup()

" TODO: There must be a better way of doing this...
autocmd BufWritePre *.go :silent! lua vim.lsp.buf.formatting_sync(nil,500)
autocmd BufWritePre *.c :silent! lua vim.lsp.buf.formatting_sync(nil,500)
autocmd BufWritePre *.hs :silent! lua vim.lsp.buf.formatting_sync(nil,500)
autocmd BufWritePre *.rs :silent! lua vim.lsp.buf.formatting_sync(nil,500)
autocmd BufWritePre *.py :silent! lua vim.lsp.buf.formatting_sync(nil,500)

