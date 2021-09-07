autocmd FileType go :silent! lua require('go').setup()

" TODO: Find a more elegant way to do this
autocmd BufWritePre *.go :silent! lua vim.lsp.buf.formatting_sync(nil,500)
autocmd BufWritePre *.c :silent! lua vim.lsp.buf.formatting_sync(nil,500)
autocmd BufWritePre *.hs :silent! lua vim.lsp.buf.formatting_sync(nil,500)

