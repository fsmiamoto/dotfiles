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

" Don't show the mode on cmd
set noshowmode

set number
set relativenumber

set cmdheight=1
set showtabline=2

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

set noemoji

set cursorline

"  ***** Basic Mappings *****
let mapleader=","

nnoremap ; :
vnoremap ; :

nnoremap : ;

" Open fold
nnoremap <space><space> za
nnoremap <space>r zR
nnoremap <space>m zM

cnoremap <C-e> <End>
cnoremap <C-w> <Home>

" Make current word uppercase
inoremap <C-u> <Esc>viWgUEa

" Duplicate the current line
nnoremap <space>d :t.<CR>

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

" Replace selected text
nnoremap <leader>rp :%s///g<Left><Left>
xnoremap <leader>rp :s///g<Left><Left>

" Open vimrc on a vertical split
nnoremap <leader>v :vsplit $MYVIMRC<CR>

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

" Skip quickfix when switching buffers
nnoremap <silent> <Tab> :bn<Bar>if &buftype ==# 'quickfix'<Bar>bn<Bar>endif<CR>
nnoremap <silent> <S-Tab> :bp<Bar>if &buftype ==# 'quickfix'<Bar>bp<Bar>endif<CR>

if (has("termguicolors"))
    set termguicolors
endif

" Theming
set t_Co=256
hi Normal ctermbg=NONE guibg=NONE

augroup startup
    autocmd!
    autocmd CursorMoved * call MaybeCenter()
augroup END

augroup filetypes
    autocmd!
    " File based changes
    autocmd FileType typescript,typescript.jsx,javascript,javascript.jsx,html setlocal shiftwidth=2 softtabstop=2 tabstop=2
    autocmd FileType c,cpp,java,php,vim,zsh,puppet,python,rust,twig,xml,yml,perl,sql autocmd BufWritePre <buffer> if !exists('g:keep_trailing_whitespace') | call StripTrailingWhitespace() | endif
    autocmd FileType php inoremap .. ->
    autocmd FileType markdown :onoremap ih :<c-u>execute "normal! ?^\\([=-]\\)\\1\\+$\r:nohlsearch\rkvg_"<cr>
    autocmd FileType markdown :onoremap ah :<c-u>execute "normal! ?^\\([=-]\\)\\1\\+$\r:nohlsearch\rg_vk0"<cr>
    if exists("+omnifunc")
        autocmd Filetype *
                    \	if &omnifunc == "" |
                    \		setlocal omnifunc=syntaxcomplete#Complete |
                    \	endif
    endif
augroup END

" ***** Functions *****

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
    let jumpSize = 15 "lines

    if abs(curr - prev) >= jumpSize && (curr - top < jumpSize || bot - curr < jumpSize)
        normal! zz
    endif

    let b:prev_line = curr
endfunction

if has("nvim")
    source $HOME/.config/nvim/plugins.vim
    for f in split(glob('~/.config/nvim/plugins/*.vim'), '\n')
      exec 'source' f
    endfor
endif
