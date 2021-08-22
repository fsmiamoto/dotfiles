autocmd FileType go :silent! lua require('go').setup()
autocmd BufWritePre *.go :silent! lua require('go.format').gofmt()
