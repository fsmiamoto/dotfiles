
" ██╗   ██╗██╗███╗   ███╗██████╗  ██████╗ *
" ██║   ██║██║████╗ ████║██╔══██╗██╔════╝
" ██║   ██║██║██╔████╔██║██████╔╝██║     
" ╚██╗ ██╔╝██║██║╚██╔╝██║██╔══██╗██║     
"  ╚████╔╝ ██║██║ ╚═╝ ██║██║  ██║╚██████╗
"    ╚═══╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝
"

syntax on
filetype plugin indent on 

call plug#begin('~/.config/nvim/plugged')
Plug 'Shougo/deoplete.nvim', { 'do': ':UpdateRemotePlugins'  }
Plug 'deoplete-plugins/deoplete-jedi'
Plug 'w0rp/ale'
Plug 'junegunn/fzf.vim'
Plug 'scrooloose/nerdtree'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-fugitive'
Plug 'ervandew/supertab'
Plug 'Shougo/neco-syntax'
Plug 'vim-airline/vim-airline'
Plug 'rust-lang/rust.vim'
Plug 'sheerun/vim-polyglot'
Plug 'dylanaraps/wal.vim'
Plug 'pangloss/vim-javascript'
Plug 'mxw/vim-jsx'
Plug 'mattn/emmet-vim'
Plug 'leafgarland/typescript-vim'
Plug 'chaoren/vim-wordmotion'
Plug 'jiangmiao/auto-pairs'
Plug 'morhetz/gruvbox'
call plug#end()

colorscheme gruvbox
let g:airline_theme='gruvbox'

set hidden
set number 
set relativenumber

set ai
set ci
set expandtab
set shiftwidth=4
set tabstop=4
set noswapfile
set sm
set autoread
set ignorecase

set wildmode=longest,list,full
set wildmenu
let mapleader=","

set enc=utf-8
set fileencoding=utf-8
set incsearch

nnoremap ; :
vnoremap ; :

" Copy and paste
map <C-c> "+y
map <C-p> "+p

" Replace in the doc
map <C-r> :%s/

" Save the file
map <C-s> :w<CR>
map <leader>f :FZF<CR>

" Move lines up and down
nnoremap <C-j> :m .+1<CR>==
nnoremap <C-k> :m .-2<CR>==
inoremap <C-j> <Esc>:m .+1<CR>==gi
inoremap <C-k> <Esc>:m .-2<CR>==gi
vnoremap <C-j> :m '>+1<CR>gv=gv
vnoremap <C-k> :m '<-2<CR>gv=gv

" Plugin Configs

" NERDTree
map <F2> :NERDTreeToggle<CR>

" Autoopen on a directory
autocmd StdinReadPre * let s:std_in=1
autocmd VimEnter * if argc() == 1 && isdirectory(argv()[0]) && !exists("s:std_in") | exe 'NERDTree' argv()[0] | wincmd p | ene | exe 'cd '.argv()[0] | endif

" Deoplete

let g:deoplete#enable_at_startup = 1
" Closes preview window after completion
autocmd InsertLeave * if pumvisible() == 0 | silent! pclose | endif

" ALE 
let g:ale_lint_on_insert_leave = 1
let g:ale_fix_on_save = 1
let g:ale_set_ballons = 1
let g:airline#extensions#ale#enabled = 1
let g:ale_fixers = { 'python': [ 
\           'autopep8', 
\           'add_blank_lines_for_python_control_statements' 
\           ],
\           'javascript': [ 'prettier' ],
\           'typescript': [ 'prettier' ],
\}

"Supertab
let g:SuperTabDefaultCompletionType = "<c-n>"
