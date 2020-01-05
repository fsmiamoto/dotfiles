# ███████╗███████╗██╗  ██╗██████╗  ██████╗
# ╚══███╔╝██╔════╝██║  ██║██╔══██╗██╔════╝
#   ███╔╝ ███████╗███████║██████╔╝██║
#  ███╔╝  ╚════██║██╔══██║██╔══██╗██║
# ███████╗███████║██║  ██║██║  ██║╚██████╗
# ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝

# Oh my zsh
plugins=(
    git 
    zsh-syntax-highlighting 
    zsh-autosuggestions
    zsh-vimto
)

ZSH_THEME="temaDaora"

[ -f ~/.oh-my-zsh/oh-my-zsh.sh ] && source ~/.oh-my-zsh/oh-my-zsh.sh

# PyWal colors
[ -f ~/.cache/wal/colors.sh ] && source ~/.cache/wal/colors.sh

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
export FZF_DEFAULT_COMMAND='rg --files --follow --hidden'

# zsh-vimto
export VIMTO_COLOR_NORMAL_TEXT=$foreground
export VIMTO_COLOR_NORMAL_BACKGROUND=$background

# zsh-autosuggestions
export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#4f4f4f"
bindkey '^e' autosuggest-accept

# Better autocompletion
autoload -U compinit
zmodload zsh/complist
zstyle ":completion:*" menu select
compinit

# <C-w> to edit line in editor
autoload edit-command-line
zle -N edit-command-line
bindkey '^w' edit-command-line


## Aliases
alias c='clear'
alias s='startx'
alias clip="xclip -selection clipboard"
alias oct="octave-cli"
alias py='python'
alias arduino="arduino-cli"
alias sv="sudo $EDITOR"
alias v="$EDITOR"
alias trt="transmission-remote-cli"
alias v.="$EDITOR ."

alias pyenv="source env/bin/activate"

alias pac="sudo pacman"
alias paci="sudo pacman -S"
alias pacs="pacman -Ss"
alias pacu="sudo pacman -Syu"

alias gc="git commit -m"
alias gco="git commit"
alias gC="git add -A && git commit -m"
alias gck="git checkout"
alias gcb="git checkout -b"
alias gr="git remote"
alias ga="git add"
alias gaa="git add --all"
alias gf="git fetch --all"
alias gst="git status"
alias gsta="git stash"
alias gstap="git stash pop"
alias gstal="git stash list"
alias gps="git push"
alias gpl="git pull"
alias glo="git log" --graph --decorate --all

alias tm="tmux"
alias tma="tmux attach-session"
alias tmd="tmux detach"
alias tmn="tmux new-session"
alias tmls="tmux ls"
alias tmks="tmux kill-session"
alias tmksv="tmux kill-server"

alias i3c="$EDITOR ~/.config/i3/config"
alias vimc="$EDITOR ~/.vimrc"
alias pbc="$EDITOR ~/.config/polybar/config"
alias xrc="$EDITOR ~/.Xresources"
alias bsc="$EDITOR ~/.bashrc"
alias zshc="$EDITOR ~/.zshrc"
alias tmc="$EDITOR ~/.tmux.conf"

alias src="source $HOME/.zshrc"

# Removes all letters with marks
alias removeracentos='sed 'y/áÁàÀãÃâÂéÉêÊíÍóÓõÕôÔúÚçÇ/aAaAaAaAeEeEiIoOoOoOuUcC/''

######  Functions #######

# Auto ls when cd'ing
chpwd(){
    emulate -L zsh
    exa --group-directories-first
}

# Creates a directory and cd's into it
mkd() {
    mkdir $1 && cd $1
}

# Lists my config files and opens it on $EDITOR
cfg() {
    file=$( find $HOME/.config -type f | fzf ) && $EDITOR $file
}

pdf(){
    FILE=$(find UTFPR | grep \.pdf | cut -f 1 --complement -d '/' |fzf  --layout=reverse --prompt='Choose a PDF: ')
   zathura "UTFPR/$FILE" & disown;
   exit;
}

get-thumbnail(){
    ffmpeg  -itsoffset -105 -i $1 -vcodec mjpeg -vframes 1 -an -f rawvideo -s 300x300 $2;
}

clone(){
    PROJECT_DIR="$HOME/Dev"
    test  -n "$1" && cd $PROJECT_DIR > /dev/null && git clone $1
    echo "Missing repository URL"
}

ide(){
    tmux split-window -h -p 35
    tmux split-window -v -p 60
    tmux select-pane -L
    $EDITOR .
}

# Change directories with lf
# Credit to Luke Smith
lfcd(){
    tmp="$(mktemp)"
    lf -last-dir-path="$tmp" "$@"
    if [ ! -f "$tmp" ]; then
        return
    fi
    dir="$(cat "$tmp")"
    rm -f "$tmp"
    [ -d "$dir" ] && [ "$dir" != "$(pwd)" ] && cd "$dir"
}

bindkey -s '^o' 'lfcd\n'

# Expansion of aliases
# Credit: https://blog.sebastian-daschner.com/entries/zsh-aliases

# blank aliases
typeset -a baliases
baliases=()

balias() {
  alias $@
  args="$@"
  args=${args%%\=*}
  baliases+=(${args##* })
}

# ignored aliases
typeset -a ialiases
ialiases=()

ialias() {
  alias $@
  args="$@"
  args=${args%%\=*}
  ialiases+=(${args##* })
}

# functionality
expand-alias-space() {
  [[ $LBUFFER =~ "\<(${(j:|:)baliases})\$" ]]; insertBlank=$?
  if [[ ! $LBUFFER =~ "\<(${(j:|:)ialiases})\$" ]]; then
    zle _expand_alias
  fi
  zle self-insert
  if [[ "$insertBlank" = "0" ]]; then
    zle backward-delete-char
  fi
}
zle -N expand-alias-space

bindkey " " expand-alias-space
bindkey -M isearch " " magic-space

# Ignored aliases, not expanded
ialias cat="bat -p --theme='OneHalfDark'"
ialias sed='sed -E'
ialias vim="nvim"
ialias ls="exa"
ialias l="exa -l"
ialias grep="grep --color=auto"
ialias fzf="fzf --color=16 --preview 'bat --theme='OneHalfDark' --style=numbers --color=always {}'"
ialias diff="diff --color=auto"

