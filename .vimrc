" ██╗   ██╗██╗███╗   ███╗██████╗  ██████╗
" ██║   ██║██║████╗ ████║██╔══██╗██╔════╝
" ██║   ██║██║██╔████╔██║██████╔╝██║
" ╚██╗ ██╔╝██║██║╚██╔╝██║██╔══██╗██║
"  ╚████╔╝ ██║██║ ╚═╝ ██║██║  ██║╚██████╗
"    ╚═══╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝ ╚═════╝

syntax on
filetype plugin indent on
set nocompatible

set enc=utf-8
set fileencoding=utf-8

set background=dark

" Allows buffer switching w/o saving
set hidden

set number
set relativenumber

set cmdheight=1

set nowrap

" Allow for cursor beyond last character
set virtualedit=onemore

" Show more lines at top/bottom
set scrolloff=3

" Store a ton of history (default is 20)
set history=2000

set splitright
set splitbelow

" Indentation
set shiftwidth=4
set tabstop=4
set softtabstop=4
set autoindent
set expandtab
set smartindent
set breakindent

set showmatch
set updatetime=300

set autoread

" Folding
set foldenable
set foldcolumn=1
set foldlevel=0
set foldmethod=syntax
set foldnestmax=1
set foldmarker=\ {{{,\ }}}

set fillchars=vert:┃
set fillchars+=fold:·

set noswapfile
set nobackup
set nowritebackup

set lazyredraw

set shortmess+=c

set mouse=a

set wildmode=longest,list,full
set wildmenu

" Searching
set incsearch
set smartcase
set ignorecase
set hlsearch

"  ***** Basic Mappings *****
let mapleader=","

nnoremap ; :
vnoremap ; :

" Open fold
nnoremap <space><space> za
nnoremap <space>r zR
nnoremap <space>m zM

cnoremap <C-e> <End>
cnoremap <C-w> <Home>

" Make current word uppercase
inoremap <C-u> <Esc>viWgUEa

" Yank until the end of line
nnoremap Y y$

" Yank entire file
nnoremap <silent> <leader>ya :%y<CR>
" Yank to clipboard
nnoremap <silent> <leader>yc :%y+<CR>

" Easier to type
nnoremap H ^
vnoremap H ^
nnoremap L $
vnoremap L $

" Move to T-op
nnoremap T H

" Move to B-ottom
nnoremap B L

" Open help for the word under the cursor
nnoremap <silent> <leader>h :<C-u>help <C-r><C-w><CR>

" Copy and paste
noremap <C-c> "+y
noremap <C-p> "+p

" Save the file
noremap <C-s> :w<CR>

" Move lines up and down
nnoremap - :m .+1<CR>==
nnoremap _ :m .-2<CR>==

vnoremap - :m '>+1<CR>gv=gv
vnoremap _ :m '<-2<CR>gv=gv

" Operator pending mappings

" Quotes and single quotes
onoremap tq t"
onoremap iq i"
onoremap isq i'
onoremap aq a"
onoremap asq a'

" Parenthesis
onoremap ip i(
onoremap ap a(
" Next and 'last' (previous)
onoremap inp :<c-u>normal! f(vi(<cr>
onoremap ilp :<c-u>normal! F)vi(<cr>

" Curly braces
onoremap ib i{
onoremap ab a{
" Next and 'last' (previous)
onoremap inb :<c-u>normal! f{vi{<cr>
onoremap ilb :<c-u>normal! F}vi{<cr>

" No highlight
nnoremap <silent> <Esc><Esc> :nohlsearch<CR>

" Reload vimrc
nnoremap <leader>r :source $HOME/.vimrc<CR>

" Open vimrc on a vertical split
nnoremap <leader>v :vsplit $MYVIMRC<CR>

" Close buffer
nnoremap <C-q> :bd<CR>

" Split window
noremap <leader>ss :split<Return><C-w>w
noremap <leader>sv :vsplit<Return><C-w>w

" Resize window
nnoremap <C-w><left> <C-w><
nnoremap <C-w><right> <C-w>>
nnoremap <C-w><up> <C-w>+
nnoremap <C-w><down> <C-w>-

" Add blank line
nnoremap <CR> :normal o<Esc>k

" Avoid going into ex mode
nmap Q q

" Skip quickfix when switching buffers
nnoremap <silent> <Tab> :bn<Bar>if &buftype ==# 'quickfix'<Bar>bn<Bar>endif<CR>
nnoremap <silent> <S-Tab> :bp<Bar>if &buftype ==# 'quickfix'<Bar>bp<Bar>endif<CR>

if (has("termguicolors"))
    set termguicolors
endif

" ***** Plugins *****
call plug#begin()
Plug 'chaoren/vim-wordmotion'
Plug 'chriskempson/base16-vim'
Plug 'christoomey/vim-tmux-navigator'
Plug 'easymotion/vim-easymotion'
Plug 'edkolev/tmuxline.vim'
Plug 'jiangmiao/auto-pairs'
Plug 'junegunn/fzf.vim'
Plug 'junegunn/vim-easy-align'
Plug 'junegunn/vim-slash'
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'ryanoasis/vim-devicons'
Plug 'scrooloose/nerdtree'
Plug 'sheerun/vim-polyglot'
Plug 'terryma/vim-multiple-cursors'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-surround'
Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'
Plug 'yuki-ycino/fzf-preview.vim'

" Lazy-loaded
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries', 'for': 'go'}
Plug 'leafgarland/typescript-vim', { 'for': 'typescript' }
Plug 'mxw/vim-jsx', {'for': 'javascript'}
Plug 'pangloss/vim-javascript', {'for': 'javascript'}
Plug 'rust-lang/rust.vim', { 'for': 'rust' }
Plug 'styled-components/vim-styled-components', { 'for': ['typescriptreact', 'javascriptreact'], 'branch': 'main' }
call plug#end()

" Theming
colorscheme base16-tomorrow-night
let g:airline_theme='base16_tomorrow'

" Underscore cursor
highlight Cursor guifg=white guibg=black
highlight iCursor guifg=white guibg=steelblue
set guicursor=n-v-c-sm:hor20,i-ci-ve:ver25-Cursor,r-cr-o:hor20

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
let g:airline_section_z = 'ℓ %2l/%L : %2c'

" Hides file encoding section
" let g:airline_section_y = airline#section#create([])

let g:go_fmt_command = "goimports"    " Run goimports along gofmt on each save
let g:go_fmt_experimental = 1         " Don't refold on every save
let g:go_auto_type_info = 1           " Automatically get signature/type info for object under cursor
let g:go_def_mapping_enabled = 0      " Disable default mapping for go to def
let g:go_doc_keywordprg_enabled = 0   " Disable default mapping to see doc
let g:go_fold_enable = ['block', 'import']

let g:coc_global_extensions = ['coc-json', 'coc-tsserver', 'coc-python', 'coc-prettier', 'coc-omni', 'coc-rls', 'coc-snippets']
let g:coc_snippet_next = '<C-w>'

let g:tmuxline_preset = {
            \'a'    : '#S',
            \'win' : '#I #W',
            \'cwin'  : ['#I','#W#{?window_zoomed_flag, 🔍,}', '#F' ],
            \'x'    : '#(jp-date a)',
            \'y'    : '%m月%d日',
            \'z'    : '%R',
            \'options' :{'status-justify': 'left'}}



set rtp +=~/.fzf
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


let g:EasyMotion_do_mapping = 0 " Disable default mappings
let g:EasyMotion_smartcase = 1

" ***** Plugin mappings *****

" Search for files
nnoremap <leader>f :FzfPreviewProjectFiles<CR>

" Search for buffers
nnoremap <leader>b :FzfPreviewBuffers<CR>

" Search for lines
nnoremap <leader>l :BLines<CR>
nnoremap <leader>L :Lines<CR>

" Search for mappings
nnoremap <leader>m :Maps<CR>

" Search for filetypes
nnoremap <leader>t :Filetypes<CR>

" Shortcuts for fugitive
nnoremap <leader>gs :FzfPreviewGitStatus<CR>
nnoremap <leader>gd :Gvdiffsplit<CR>
nnoremap <leader>gw :Gwrite<CR>
nnoremap <leader>gc :Gcommit<CR>

nnoremap <C-f> :FzfPreviewProjectGrep<CR>

" Run file using vim-run script, saves before.
nnoremap <silent><leader>rf :w<bar>!vim-run %:p<CR><CR>

" Plug bindings
nnoremap <leader>pi :PlugInstall<CR>
nnoremap <leader>pu :PlugUpdate<CR>
nnoremap <leader>pc :PlugClean<CR>

" Rename current symbol
nmap <leader>rn <Plug>(coc-rename)

nnoremap <leader>cr :CocRestart<CR>
nnoremap <leader>ci :CocInstall

" Remap keys for gotos
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)

" Navigate diagnostics
nmap <silent> <space>k <Plug>(coc-diagnostic-prev)
nmap <silent> <space>j <Plug>(coc-diagnostic-next)

nnoremap <silent> <space>o :<C-u>CocList outline<CR>
nnoremap <silent> <space>s :<C-u>CocList -I symbols<CR>
nnoremap <silent> <space>d :<C-u>CocList diagnostics<CR>

" Use K to show documentation in preview window
nnoremap <silent> K :call <SID>show_documentation()<CR>

" Use <CR> to complete
inoremap <expr> <cr> pumvisible() ? coc#_select_confirm() : "\<C-g>u\<CR>"

" Tab to cycle through completion options
inoremap <expr> <Tab> pumvisible() ? "\<C-n>" : "\<Tab>"
inoremap <expr> <S-Tab> pumvisible() ? "\<C-p>" : "\<S-Tab>"


" EasyAlign
xnoremap ga <Plug>(EasyAlign)
nnoremap ga <Plug>(EasyAlign)

" NERDTree
noremap <F2> :NERDTreeToggle<CR>

" easymotion
nmap s <Plug>(easymotion-s2)
map <space>l <Plug>(easymotion-bd-jk)
map <space>s <Plug>(easymotion-sl)
map  <space>w <Plug>(easymotion-bd-w)

" ***** Commands *****

" Preview window
" command! -bang -nargs=? -complete=dir Files
"             \ call fzf#vim#files(<q-args>, fzf#vim#with_preview(), <bang>0)

augroup startup
    autocmd!
    autocmd CursorMoved * call MaybeCenter()
augroup END

augroup coc
    autocmd!
    " Close preview window on leaving Insert Mode
    autocmd InsertLeave * if pumvisible() == 0 | silent! pclose | endif
    " Highlight symbol under cursor on CursorHold
    autocmd CursorHold * silent call CocActionAsync('highlight')
augroup END

augroup filetypes
    " Clear previous autocmd's
    autocmd!

    " File based changes
    autocmd FileType typescript,typescript.jsx,javascript,javascript.jsx,html setlocal shiftwidth=2 softtabstop=2 tabstop=2
    autocmd FileType c,cpp,java,php,vim,zsh,puppet,python,rust,twig,xml,yml,perl,sql autocmd BufWritePre <buffer> if !exists('g:keep_trailing_whitespace') | call StripTrailingWhitespace() | endif

    " Go abbreviations
    autocmd FileType go :cabbrev gi GoImport
    autocmd FileType go :cabbrev gd GoDoc
    autocmd FileType go :cabbrev gt GoTest
    autocmd FileType go nnoremap <space>t :GoTest<CR>

    " Markdown mappings to change a header
    autocmd FileType markdown :onoremap ih :<c-u>execute "normal! ?^\\([=-]\\)\\1\\+$\r:nohlsearch\rkvg_"<cr>
    autocmd FileType markdown :onoremap ah :<c-u>execute "normal! ?^\\([=-]\\)\\1\\+$\r:nohlsearch\rg_vk0"<cr>

    if exists("+omnifunc")
        autocmd Filetype *
                    \	if &omnifunc == "" |
                    \		setlocal omnifunc=syntaxcomplete#Complete |
                    \	endif
    endif
augroup END


" Enable omni completion

" ***** Functions *****

" Show documentation for symbol
" Opens :help for vim filetypes
function! s:show_documentation()
    if &filetype == 'vim'
        execute 'h '.expand('<cword>')
    else
        call CocAction('doHover')
    endif
endfunction

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

" Auto-zz after a big jump
" Credit: https://www.reddit.com/r/vim/comments/cgpnbf/automatically_zz_after_jump/eujeimv?utm_source=share&utm_medium=web2x
function! MaybeCenter() abort
    let curr = line('.')
    let prev = get(b:, 'prev_line', curr)
    let top = line('w0')
    let bot = line('w$')

    if abs(curr - prev) >= 15 && (curr - top < 15 || bot - curr < 15)
        normal! zz
    endif

    let b:prev_line = curr
endfunction

