
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
Plug 'chaoren/vim-wordmotion'
Plug 'christoomey/vim-tmux-navigator'
Plug 'daeyun/vim-matlab'
Plug 'dylanaraps/wal.vim'
Plug 'edkolev/tmuxline.vim'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
Plug 'heavenshell/vim-jsdoc'
Plug 'iamcco/markdown-preview.nvim', { 'do': 'cd app & yarn install'  }
Plug 'jiangmiao/auto-pairs'
Plug 'jparise/vim-graphql'
Plug 'junegunn/fzf.vim'
Plug 'junegunn/vim-easy-align'
Plug 'junegunn/vim-slash'
Plug 'leafgarland/typescript-vim'
Plug 'mattn/emmet-vim'
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

colorscheme gruvbox
let g:airline_theme='gruvbox'
set background=dark

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
map <leader>a :Ag 

" Search for lines
map <leader>l :BLines<CR>
map <leader>L :Lines<CR>

" Search for mappings
map <leader>m :Maps<CR>

" Search for filetypes
map <leader>t :Filetypes<CR>

" Shortcuts for fugitive
map <leader>gf :GFiles<CR>
map <leader>gs :Gstatus<CR>
map <leader>gd :Gvdiffsplit<CR>
map <leader>gw :Gwrite<CR>
map <leader>gc :Gcommit<CR>

" No highlight
map <leader>q :noh<CR>

" Reload vimrc
map <leader>r :source $HOME/.vimrc<CR>

" Run file using vim-run script, saves before.
map <silent><leader>rf :w<bar>!vim-run %:p<CR><CR>

" Move lines up and down
nnoremap <C-A-j> :m .+1<CR>==
nnoremap <C-A-k> :m .-2<CR>==
inoremap <C-A-j> <Esc>:m .+1<CR>==gi
inoremap <C-A-k> <Esc>:m .-2<CR>==gi
vnoremap <C-A-j> :m '>+1<CR>gv=gv
vnoremap <C-A-k> :m '<-2<CR>gv=gv

" Putting the arrow keys to use
nnoremap <C-Left> :bp<CR>
nnoremap <C-Right> :bn<CR>

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
let g:airline_section_z = '%#__accent_bold#%{g:airline_symbols.linenr}%2l/%L'

" Auto-pairs
let g:AutoPairsFlyMode = 0

" NERDTree
map <F2> :NERDTreeToggle<CR>

"vim-go
let g:go_fmt_command = "goimports"    " Run goimports along gofmt on each save     
let g:go_auto_type_info = 1           " Automatically get signature/type info for object under cursor     
let g:go_def_mapping_enabled = 0      " Disable default mapping for go to def
let g:go_doc_keywordprg_enabled = 0   " Disable default mapping to see doc

" COC

let g:coc_global_extensions = ['coc-json', 'coc-tsserver', 'coc-python', 'coc-prettier', 'coc-eslint', 'coc-omni']

set cmdheight=1

set updatetime=300

" Use <tab> for trigger completion, completion confirm.
inoremap <silent><expr> <TAB>
      \ pumvisible() ? coc#_select_confirm() :
      \ <SID>check_back_space() ? "\<TAB>" :
      \ coc#refresh()

function! s:check_back_space() abort
  let col = col('.') - 1
  return !col || getline('.')[col - 1]  =~# '\s'
endfunction

" Use <CR> to complete
inoremap <expr> <cr> pumvisible() ? "\<C-y>" : "\<C-g>u\<CR>"

let g:coc_snippet_next = '<CR>'
let g:coc_snippet_confirm = '<CR>'

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
      \'y'    : '%m/%d',
      \'z'    : '%R',
      \'options' :{'status-justify': 'left'}}

" vim-matlab
let g:matlab_auto_mappings = 0
let g:matlab_server_launcher = 'tmux'

" fzf

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
