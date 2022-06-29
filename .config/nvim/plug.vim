" Auto download vim-plug
if empty(glob('~/.config/nvim/autoload/plug.vim'))
  silent !curl -fLo ~/.config/nvim/autoload/plug.vim --create-dirs
    \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
endif

call plug#begin()
Plug 'michaelb/vim-tips'
Plug 'windwp/nvim-autopairs'
Plug 'chaoren/vim-wordmotion'
Plug 'christoomey/vim-tmux-navigator'
Plug 'windwp/windline.nvim'
Plug 'nvim-lua/plenary.nvim'
Plug 'lewis6991/gitsigns.nvim', {'branch': 'main'}
Plug 'akinsho/bufferline.nvim'
Plug 'tpope/vim-repeat'
Plug 'junegunn/fzf.vim'
Plug 'junegunn/fzf', { 'do': { -> fzf#install() } }
Plug 'junegunn/vim-easy-align'
Plug 'junegunn/goyo.vim'
Plug 'justinmk/vim-sneak'
Plug 'machakann/vim-highlightedyank'
Plug 'vim-test/vim-test'
Plug 'rktjmp/lush.nvim'
Plug 'ellisonleao/gruvbox.nvim'
Plug 'mg979/vim-visual-multi', {'branch': 'master'}
Plug 'neovim/nvim-lspconfig'
Plug 'hrsh7th/nvim-compe'
Plug 'nvim-lua/plenary.nvim'
Plug 'gfanto/fzf-lsp.nvim'
Plug 'ray-x/lsp_signature.nvim'
Plug 'ray-x/go.nvim'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-eunuch'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-surround'
Plug 'ptzz/lf.vim'
Plug 'voldikss/vim-floaterm'
Plug 'nvim-treesitter/nvim-treesitter', {'do': ':TSUpdate'}
Plug 'nvim-treesitter/playground'
Plug 'mhinz/vim-sayonara'
Plug 'tami5/lspsaga.nvim'
Plug 'mfussenegger/nvim-jdtls'
Plug 'mfussenegger/nvim-dap'
call plug#end()

" Plug bindings
nnoremap <leader>pi :PlugInstall<CR>
nnoremap <leader>pu :PlugUpdate<CR>
nnoremap <leader>pc :PlugClean<CR>
