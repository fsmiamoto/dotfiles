syntax on
filetype plugin indent on 

call plug#begin('~/.config/nvim/plugged')
Plug 'ajh17/VimCompletesMe'
Plug 'rust-lang/rust.vim'
Plug 'sonph/onehalf'
Plug 'sheerun/vim-polyglot'
Plug 'dylanaraps/wal.vim'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-commentary'
Plug 'pangloss/vim-javascript'
Plug 'mxw/vim-jsx'
Plug 'mattn/emmet-vim'
Plug 'leafgarland/typescript-vim'
Plug 'jiangmiao/auto-pairs'
call plug#end()

colorscheme wal

set hidden
set number 
set relativenumber
set inccommand=split

set ai
set ci
set expandtab
set shiftwidth=4
set tabstop=4
set sm

set wildmode=longest,list,full
set wildmenu
let mapleader="\<space>"

set enc=utf-8
set fileencoding=utf-8

nnoremap ; :

map <C-c> "+y
map <C-p> "+p
map <C-r> :%s/
