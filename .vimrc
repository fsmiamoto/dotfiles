
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
Plug 'junegunn/fzf.vim'
Plug 'scrooloose/nerdtree'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-fugitive'
Plug 'vim-airline/vim-airline'
Plug 'rust-lang/rust.vim'
Plug 'edkolev/tmuxline.vim'
Plug 'sheerun/vim-polyglot'
Plug 'dylanaraps/wal.vim'
Plug 'pangloss/vim-javascript'
Plug 'mxw/vim-jsx'
Plug 'mattn/emmet-vim'
Plug 'leafgarland/typescript-vim'
Plug 'chaoren/vim-wordmotion'
Plug 'jiangmiao/auto-pairs'
Plug 'morhetz/gruvbox'
Plug 'christoomey/vim-tmux-navigator'
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
" Plug 'Shougo/deoplete.nvim', { 'do': ':UpdateRemotePlugins'  }
" Plug 'deoplete-plugins/deoplete-jedi'
" Plug 'w0rp/ale'
" Plug 'ervandew/supertab'
" Plug 'Shougo/neco-syntax'
" Plug 'deoplete-plugins/deoplete-go'
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
set sm
set autoread

set noswapfile
set nobackup

set mouse=a

set wildmode=longest,list,full
set wildmenu
let mapleader=","

set incsearch
set smartcase
set ignorecase

set enc=utf-8
set fileencoding=utf-8

nnoremap ; :
vnoremap ; :

" Copy and paste
map <C-c> "+y
map <C-p> "+p

" Save the file
map <C-s> :w<CR>

" Search for files
map <leader>f :Files<CR>

" Shortcuts for fugitive
map <leader>gf :GFiles<CR>
map <leader>gs :Gstatus<CR>
map <leader>gd :Gvdiffsplit<CR>
map <leader>gw :Gwrite<CR>

" No highlight
map <leader>h :noh<CR>

" Reload vimrc
map <leader>r :source $HOME/.vimrc<CR>

" Move lines up and down
nnoremap <C-J> :m .+1<CR>==
nnoremap <C-K> :m .-2<CR>==
inoremap <C-J> <Esc>:m .+1<CR>==gi
inoremap <C-K> <Esc>:m .-2<CR>==gi
vnoremap <C-J> :m '>+1<CR>gv=gv
vnoremap <C-K> :m '<-2<CR>gv=gv

" Putting the arrow keys to use
nnoremap <Left> :bp<CR>
nnoremap <Right> :bn<CR>

" Close buffer
map <C-q> :bd<CR>

" Split window
map <leader>ss :split<Return><C-w>w
map <leader>sv :vsplit<Return><C-w>w

" Resize window
nmap <C-w><left> <C-w><
nmap <C-w><right> <C-w>>
nmap <C-w><up> <C-w>+
nmap <C-w><down> <C-w>-

" File based changes
autocmd FileType javascript     setlocal shiftwidth=2 softtabstop
autocmd FileType typescript     setlocal shiftwidth=2 softtabstop
autocmd FileType typescript.tsx setlocal shiftwidth=2 softtabstop

" Enable omni completion
if has("autocmd") && exists("+omnifunc")
    autocmd Filetype *
                \	if &omnifunc == "" |
                \		setlocal omnifunc=syntaxcomplete#Complete |
                \	endif
endif

" Plugin Configs

let g:javascript_plugin_jsdoc = 1

" Airline
let g:airline#extensions#tabline#enabled = 1 " Show buffers as tabs
let g:airline#extensions#tabline#formatter = 'unique_tail'
let g:airline_exclude_preview = 1
let g:airline_powerline_fonts = 1

" Auto-pairs
let g:AutoPairsFlyMode = 0

" NERDTree
map <F2> :NERDTreeToggle<CR>

" COC
set cmdheight=2

set updatetime=10

" Use <tab> for trigger completion, completion confirm and snippet expand and jump.
inoremap <silent><expr> <TAB>
      \ pumvisible() ? coc#_select_confirm() :
      \ coc#expandableOrJumpable() ? "\<C-r>=coc#rpc#request('doKeymap', ['snippets-expand-jump',''])\<CR>" :
      \ <SID>check_back_space() ? "\<TAB>" :
      \ coc#refresh()

function! s:check_back_space() abort
  let col = col('.') - 1
  return !col || getline('.')[col - 1]  =~# '\s'
endfunction

let g:coc_snippet_next = '<tab>'

" Tab to cycle through completion options
inoremap <expr> <Tab> pumvisible() ? "\<C-n>" : "\<Tab>"
inoremap <expr> <S-Tab> pumvisible() ? "\<C-p>" : "\<S-Tab>"

" Close preview window on leaving Insert Mode
autocmd InsertLeave * if pumvisible() == 0 | silent! pclose | endif

" Highlight symbol under cursor on CursorHold
autocmd CursorHold * silent call CocActionAsync('highlight')

" Use K to show documentation in preview window
nnoremap <silent> K :call <SID>show_documentation()<CR>

" Remap for rename current word
nmap <leader>rn <Plug>(coc-rename)

" Remap keys for gotos
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)

" Expand snippet
imap <leader>l <Plug>(coc-snippets-expand)

" Navigate diagnostics
nmap <silent> <leader>p <Plug>(coc-diagnostic-prev)
nmap <silent> <leader>e <Plug>(coc-diagnostic-next)

" Tmuxline
let g:tmuxline_preset = {
      \'a'    : '#S',
      \'win' : '#I #W',
      \'cwin'  : ['#I','#W'],
      \'x'    : '#(jp-date a)',
      \'y'    : '%m/%d',
      \'z'    : '%R',
      \'options' :{'status-justify': 'left'}}