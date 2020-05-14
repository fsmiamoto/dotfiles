" Auto download vim-plug
if empty(glob('~/.config/nvim/autoload/plug.vim'))
  silent !curl -fLo ~/.config/nvim/autoload/plug.vim --create-dirs
    \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
endif

call plug#begin()
Plug 'antoinemadec/coc-fzf'
Plug 'chaoren/vim-wordmotion'
Plug 'chriskempson/base16-vim'
Plug 'christoomey/vim-tmux-navigator'
" Plug 'easymotion/vim-easymotion'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
Plug 'itchyny/lightline.vim'
Plug 'jiangmiao/auto-pairs'
Plug 'justinmk/vim-sneak'
Plug 'junegunn/fzf.vim'
Plug 'junegunn/vim-easy-align'
Plug 'junegunn/vim-slash'
Plug 'mengelbrecht/lightline-bufferline'
Plug 'mg979/vim-visual-multi', {'branch': 'master'}
Plug 'mhinz/vim-sayonara', { 'on': 'Sayonara' }
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'ryanoasis/vim-devicons'
Plug 'sheerun/vim-polyglot'
Plug 'stsewd/fzf-checkout.vim'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-surround'

" Lazy-loaded
Plug 'leafgarland/typescript-vim', { 'for': 'typescript' }
Plug 'mxw/vim-jsx', {'for': 'javascript'}
Plug 'pangloss/vim-javascript', {'for': 'javascript'}
Plug 'rust-lang/rust.vim', { 'for': 'rust' }
Plug 'styled-components/vim-styled-components', { 'for': ['typescriptreact', 'javascriptreact'], 'branch': 'main' }
call plug#end()

" Plug bindings
nnoremap <leader>pi :PlugInstall<CR>
nnoremap <leader>pu :PlugUpdate<CR>
nnoremap <leader>pc :PlugClean<CR>

colorscheme base16-ocean
hi Normal ctermbg=NONE guibg=NONE
