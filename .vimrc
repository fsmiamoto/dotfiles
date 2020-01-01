" ██╗   ██╗██╗███╗   ███╗██████╗  ██████╗ *
" ██║   ██║██║████╗ ████║██╔══██╗██╔════╝
" ██║   ██║██║██╔████╔██║██████╔╝██║
" ╚██╗ ██╔╝██║██║╚██╔╝██║██╔══██╗██║
"  ╚████╔╝ ██║██║ ╚═╝ ██║██║  ██║╚██████╗
"    ╚═══╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝
"
echo "おかえりなさい！"

syntax on
filetype plugin indent on

call plug#begin('~/.config/nvim/plugged')
Plug 'chaoren/vim-wordmotion'
Plug 'chriskempson/base16-vim'
Plug 'christoomey/vim-tmux-navigator'
Plug 'daeyun/vim-matlab'
Plug 'dylanaraps/wal.vim'
Plug 'edkolev/tmuxline.vim'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
Plug 'godoctor/godoctor.vim'
Plug 'jiangmiao/auto-pairs'
Plug 'jparise/vim-graphql'
Plug 'junegunn/fzf.vim'
Plug 'junegunn/vim-easy-align'
Plug 'junegunn/vim-slash'
Plug 'leafgarland/typescript-vim'
Plug 'morhetz/gruvbox'
Plug 'mxw/vim-jsx'
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'pangloss/vim-javascript'
Plug 'rust-lang/rust.vim'
Plug 'scrooloose/nerdtree'
Plug 'sheerun/vim-polyglot'
Plug 'terryma/vim-multiple-cursors'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-surround'
Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'
call plug#end()

let $NVIM_TUI_ENABLE_TRUE_COLOR=1

if (has("termguicolors"))
    set termguicolors
endif

colorscheme base16-tomorrow-night
let g:airline_theme='nicer_tomorrow'
set background=dark

" Underscore cursor
highlight Cursor guifg=white guibg=black
highlight iCursor guifg=white guibg=steelblue
set guicursor=n-v-c-sm:hor20,i-ci-ve:ver25-Cursor,r-cr-o:hor20

" Allows buffer switching w/o saving
set hidden

" Line numbering
set number
set relativenumber

" Wrap lines that don't fit
set wrap

" Allow for cursor beyond last character
set virtualedit=onemore

" Store a ton of history (default is 20)
set history=1000

set splitright
set splitbelow

" Spaces and not tabs
set expandtab

" Use 4 spaces
set shiftwidth=4
set tabstop=4
set softtabstop=4

set autoindent
set cindent
set smartindent
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

" Open fold
nnoremap <space> za

cnoremap <C-e> <End>
cnoremap <C-w> <Home>

" Change buffers
nnoremap <Tab> :bn<CR>
nnoremap <S-Tab> :bp<CR>

" Make current word uppercase
inoremap <C-u> <Esc>viWgUEa

" Yank until the end of line
nmap Y y$

" Magic mode
nnoremap / /\v
vnoremap / /\v

" Copy and paste
noremap <C-c> "+y
noremap <C-p> "+p

" Save the file
noremap <C-s> :w<CR>

" Search for files
noremap <leader>f :Files<CR>
noremap <leader>a :Ag

" Search for buffers
noremap <leader>b :Buffers<CR>

" Search for lines
noremap <leader>l :BLines<CR>
noremap <leader>L :Lines<CR>

" Search for mappings
noremap <leader>m :Maps<CR>

" Search for filetypes
noremap <leader>t :Filetypes<CR>

" Shortcuts for fugitive
noremap <leader>gf :GFiles<CR>
noremap <leader>gs :Gstatus<CR>
noremap <leader>gd :Gvdiffsplit<CR>
noremap <leader>gw :Gwrite<CR>
noremap <leader>gc :Gcommit<CR>

noremap <leader>d :GoDoc
noremap <leader>db :GoDocBrowser
noremap <leader>t :GoTest<CR>


" No highlight
noremap <leader>q :noh<CR>

" Reload vimrc
noremap <leader>r :source $HOME/.vimrc<CR>

" Run file using vim-run script, saves before.
noremap <silent><leader>rf :w<bar>!vim-run %:p<CR><CR>

" Move lines up and down
nnoremap - :m .+1<CR>==
nnoremap _ :m .-2<CR>==

vnoremap - :m '>+1<CR>gv=gv
vnoremap _ :m '<-2<CR>gv=gv

" Close buffer
noremap <C-q> :bd<CR>

" Split window
noremap <leader>ss :split<Return><C-w>w
noremap <leader>sv :vsplit<Return><C-w>w

" Resize window
nmap <C-w><left> <C-w><
nmap <C-w><right> <C-w>>
nmap <C-w><up> <C-w>+
nmap <C-w><down> <C-w>-

" Plug bindings
nmap <leader>pi :PlugInstall<CR>
nmap <leader>pu :PlugUpdate<CR>
nmap <leader>pc :PlugClean<CR>

" Plugin Configs

let g:javascript_plugin_jsdoc = 1

" EasyAlign

" Start interactive EasyAlign in visual mode (e.g. vipga)
xmap ga <Plug>(EasyAlign)

" Start interactive EasyAlign for a motion/text object (e.g. gaip)
nmap ga <Plug>(EasyAlign)

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
let g:airline_section_z = 'ℓ %2l/%L c %2c'

" Auto-pairs
let g:AutoPairsFlyMode = 0

" NERDTree
noremap <F2> :NERDTreeToggle<CR>

"vim-go
let g:go_fmt_command = "goimports"    " Run goimports along gofmt on each save
let g:go_auto_type_info = 1           " Automatically get signature/type info for object under cursor
let g:go_def_mapping_enabled = 0      " Disable default mapping for go to def
let g:go_doc_keywordprg_enabled = 0   " Disable default mapping to see doc


" COC
let g:coc_global_extensions = ['coc-json', 'coc-tsserver', 'coc-python', 'coc-prettier', 'coc-omni', 'coc-rls', 'coc-snippets']

set cmdheight=1
set updatetime=300

" Use <CR> to complete
inoremap <expr> <cr> pumvisible() ? coc#_select_confirm() : "\<C-g>u\<CR>"

" Tab to cycle through completion options
inoremap <expr> <Tab> pumvisible() ? "\<C-n>" : "\<Tab>"
inoremap <expr> <S-Tab> pumvisible() ? "\<C-p>" : "\<S-Tab>"

imap <silent> <C-w> <Plug>(coc-snippets-expand-jump)
let g:coc_snippet_next = '<C-a>'

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

nmap <leader>cr :CocRestart<CR>
nmap <leader>ci :CocInstall

" Remap keys for gotos
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)

" Navigate diagnostics
nmap <silent> <leader>w <Plug>(coc-diagnostic-prev)
nmap <silent> <leader>e <Plug>(coc-diagnostic-next)

" Show list of errors
nnoremap <silent> <leader>d :CocList diagnostics<CR>


" Tmuxline
let g:tmuxline_preset = {
      \'a'    : '#S',
      \'win' : '#I #W',
      \'cwin'  : ['#I','#W#{?window_zoomed_flag, 🔍,}'],
      \'x'    : '#(jp-date a)',
      \'y'    : '%m月%d日',
      \'z'    : '%R',
      \'options' :{'status-justify': 'left'}}

" Preview window
command! -bang -nargs=? -complete=dir Files
  \ call fzf#vim#files(<q-args>, fzf#vim#with_preview(), <bang>0)

" Colors
let g:fzf_colors =
\ { 'fg':      ['fg', 'Normal'],
  \ 'bg':      ['bg', 'Normal'],
  \ 'hl':      ['fg', 'Comment'],
  \ 'fg+':     ['fg', 'CursorLine', 'CursorColumn', 'Normal'],
  \ 'bg+':     ['bg', 'CursorLine', 'CursorColumn'],
  \ 'hl+':     ['fg', 'Statement'],
  \ 'info':    ['fg', 'PreProc'],
  \ 'border':  ['fg', 'Ignore'],
  \ 'prompt':  ['fg', 'Conditional'],
  \ 'pointer': ['fg', 'Exception'],
  \ 'marker':  ['fg', 'Keyword'],
  \ 'spinner': ['fg', 'Label'],
  \ 'header':  ['fg', 'Comment'] }

" File based changes
autocmd FileType typescript,typescript.jsx,javascript,javascript.jsx,html setlocal shiftwidth=2 softtabstop=2 tabstop=2
autocmd FileType c,cpp,java,php,vim,puppet,python,rust,twig,xml,yml,perl,sql autocmd BufWritePre <buffer> if !exists('g:keep_trailing_whitespace') | call StripTrailingWhitespace() | endif

autocmd FileType go nmap <leader>d :GoDoc<CR>

" Enable omni completion
if has("autocmd") && exists("+omnifunc")
    autocmd Filetype *
                \	if &omnifunc == "" |
                \		setlocal omnifunc=syntaxcomplete#Complete |
                \	endif
endif

" Credit to github.com/spf13
function! StripTrailingWhitespace()
    " Preparation: save last search, and cursor position.
    let _s=@/
    let l = line(".")
    let c = col(".")
    " do the business:
    %s/\s\+$//e
    " clean up: restore previous search history, and cursor position
    let @/=_s
    call cursor(l, c)
endfunction
