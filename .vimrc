
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
Plug 'jparise/vim-graphql'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
" Plug 'Shougo/deoplete.nvim', { 'do': ':UpdateRemotePlugins'  }
" Plug 'deoplete-plugins/deoplete-jedi'
" Plug 'w0rp/ale'
" Plug 'ervandew/supertab'
" Plug 'Shougo/neco-syntax'
" Plug 'deoplete-plugins/deoplete-go'
call plug#end()

set termguicolors
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
set nowritebackup

set shortmess+=c

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
map <leader>gc :Gcommit<CR>

" No highlight
map <leader>h :noh<CR>

" Reload vimrc
map <leader>r :source $HOME/.vimrc<CR>

" Move lines up and down
nnoremap <A-j> :m .+1<CR>==
nnoremap <A-k> :m .-2<CR>==
inoremap <A-j> <Esc>:m .+1<CR>==gi
inoremap <A-k> <Esc>:m .-2<CR>==gi
vnoremap <A-j> :m '>+1<CR>gv=gv
vnoremap <A-k> :m '<-2<CR>gv=gv

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


" Plugin Configs

let g:javascript_plugin_jsdoc = 1

" Airline
let g:airline#extensions#tabline#enabled = 1 " Show buffers as tabs
let g:airline#extensions#tabline#formatter = 'unique_tail'
let g:airline_exclude_preview = 1
let g:airline_powerline_fonts = 1

let g:airline_mode_map = {
            \ '__'     : '-',
            \ 'c'      : 'C',
            \ 'i'      : 'I',
            \ 'ic'     : 'I',
            \ 'ix'     : 'I',
            \ 'n'      : 'N',
            \ 'multi'  : 'M',
            \ 'ni'     : 'N',
            \ 'no'     : 'N',
            \ 'R'      : 'R',
            \ 'Rv'     : 'R',
            \ 's'      : 'S',
            \ 'S'      : 'S',
            \ ''     : 'S',
            \ 't'      : 'T',
            \ 'v'      : 'V',
            \ 'V'      : 'V',
            \ ''     : 'V',
            \ }
let g:airline_skip_empty_sections = 1
" Remove fileencoding section
let g:airline_section_y = airline#section#create([])

" Auto-pairs
let g:AutoPairsFlyMode = 0

" NERDTree
map <F2> :NERDTreeToggle<CR>

" COC

let g:coc_global_extensions = ['coc-json', 'coc-tsserver', 'coc-python', 'coc-prettier', 'coc-eslint', 'coc-omni']

set cmdheight=2

set updatetime=300

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

" Use <CR> to complete
inoremap <expr> <cr> pumvisible() ? "\<C-y>" : "\<C-g>u\<CR>"

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
function! s:show_documentation()
  if &filetype == 'vim'
    execute 'h '.expand('<cword>')
  else
    call CocAction('doHover')
  endif
endfunction

" Remap for rename current word
nmap <leader>rn <Plug>(coc-rename)

" Remap keys for gotos
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)

" Navigate diagnostics
nmap <silent> <leader>p <Plug>(coc-diagnostic-prev)
nmap <silent> <leader>e <Plug>(coc-diagnostic-next)

" Show list of errors
nnoremap <silent> <leader>d :CocList diagnostics<CR>

" Tmuxline
let g:tmuxline_preset = {
      \'a'    : '#S',
      \'win' : '#I #W',
      \'cwin'  : ['#I','#W'],
      \'x'    : '#(jp-date a)',
      \'y'    : '%m/%d',
      \'z'    : '%R',
      \'options' :{'status-justify': 'left'}}

" File based changes
autocmd FileType javascript     setlocal shiftwidth=2 softtabstop
autocmd Filetype typescript     setlocal shiftwidth=2 softtabstop
autocmd Filetype typescript.tsx setlocal shiftwidth=2 softtabstop

" Enable omni completion
if has("autocmd") && exists("+omnifunc")
    autocmd Filetype *
                \	if &omnifunc == "" |
                \		setlocal omnifunc=syntaxcomplete#Complete |
                \	endif
endif
