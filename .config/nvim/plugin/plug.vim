" Auto download vim-plug
if empty(glob('~/.config/nvim/autoload/plug.vim'))
  silent !curl -fLo ~/.config/nvim/autoload/plug.vim --create-dirs
    \ https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
endif

call plug#begin()
Plug 'antoinemadec/coc-fzf'
Plug 'chaoren/vim-wordmotion'
Plug 'christoomey/vim-tmux-navigator'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
Plug 'itchyny/lightline.vim'
Plug 'jiangmiao/auto-pairs'
Plug 'junegunn/fzf.vim'
Plug 'junegunn/vim-easy-align'
Plug 'junegunn/vim-slash'
Plug 'justinmk/vim-sneak'
Plug 'mengelbrecht/lightline-bufferline'
Plug 'morhetz/gruvbox'
Plug 'mg979/vim-visual-multi', {'branch': 'master'}
Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'ryanoasis/vim-devicons'
Plug 'sheerun/vim-polyglot'
Plug 'stsewd/fzf-checkout.vim'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-surround'
Plug 'voldikss/vim-floaterm'

" Lazy-loaded
Plug 'edkolev/tmuxline.vim', { 'on': 'Tmuxline' }
Plug 'mhinz/vim-sayonara', { 'on': 'Sayonara' }
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

colorscheme gruvbox
hi Normal ctermbg=NONE guibg=NONE
