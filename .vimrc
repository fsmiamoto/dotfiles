syntax on
filetype plugin indent on

call plug#begin('~/.vim/plugged')
Plug 'dylanaraps/wal.vim'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-commentary'
Plug 'pangloss/vim-javascript'
Plug 'mxw/vim-jsx'
call plug#end()

colorscheme wal

" Encoding
set enc=utf-8
set encoding=utf-8
set fileencoding=utf-8

" Config dos splits
set splitbelow
set splitright

map ; :

" Atalhos para navegação dos splits
map <C-h> <C-w>h
map <C-j> <C-w>j
map <C-k> <C-w>k
map <C-l> <C-w>l

set number relativenumber
set is hls is scs

set nobackup
set noswapfile
set nowritebackup

set ai
set ci
set expandtab
set shiftwidth=4
set tabstop=4
set sm

set wildmode=longest,list,full
set wildmenu

" Comandos compilacao / rodar
autocmd FileType c map ;r :w<CR>:!clear && gcc % -o %< && ./%< <CR>
autocmd FileType tex map ;r :w<CR>:!clear && xelatex -halt-on-error %<CR> 
autocmd FileType tex,rmd map ;o :!evince %:r.pdf &<CR><CR>
autocmd FileType rmd map ;o :! evince %:r.pdf <CR>
autocmd FileType rmd map ;r :w<CR>:!clear && R -e "rmarkdown::render('%',output_file='%:r.pdf')"<CR>
autocmd FileType python map ;r :w<CR>:! python %<CR>

" LateX shortcuts
inoremap <s-tab> <Esc>/<++><Enter>"_c4l
vnoremap <s-tab> <Esc>/<++><Enter>"_c4l
map <s-tab> <Esc>/<++><Enter>"_c4l
autocmd FileType tex inoremap ;tb \begin{tabular}<Enter><++><Enter>\end{tabular}<Enter><Enter><++><Esc>4kA{}<Esc>i
autocmd FileType tex inoremap ;eq \begin{equation}<Enter><Enter>\end{equation}<Enter><Enter><++><Esc>3kI
autocmd FileType tex inoremap ;doc \begin{document}<Enter><Enter>\end{document}<Esc>kI
autocmd FileType tex inoremap ;sec \section{}<Enter><Enter><++><Esc>2kf}i
autocmd FileType tex inoremap ;fig \begin{figure}[ht!]<Enter>\centering <Enter>\includegraphics[width=150pt]{<++>}<Enter>\caption{<++>}<Enter>\label{fig:<++>}<Enter>\end{figure}<Esc>6k



