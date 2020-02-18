# ███████╗███████╗██╗  ██╗██████╗  ██████╗
# ╚══███╔╝██╔════╝██║  ██║██╔══██╗██╔════╝
#   ███╔╝ ███████╗███████║██████╔╝██║
#  ███╔╝  ╚════██║██╔══██║██╔══██╗██║
# ███████╗███████║██║  ██║██║  ██║╚██████╗
# ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝

export ZSH=~/.oh-my-zsh

# Oh my zsh
plugins=(
    zsh-syntax-highlighting
    zsh-autosuggestions
    zsh-vimto
)

ZSH_THEME="temaDaora"

[ -f ~/.oh-my-zsh/oh-my-zsh.sh ] && source ~/.oh-my-zsh/oh-my-zsh.sh

# Alias expansion
[ -f ~/.zsh/alias_expansion.zsh ] && source ~/.zsh/alias_expansion.zsh

# PyWal colors
[ -f ~/.cache/wal/colors.sh ] && source ~/.cache/wal/colors.sh

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
export FZF_DEFAULT_COMMAND='rg --files --follow --hidden'

# zsh-autosuggestions
export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#4f4f4f"
bindkey '^e' autosuggest-accept

# zsh-syntax-highlighting
# (https://github.com/zsh-users/zsh-syntax-highlighting/blob/master/docs/highlighters.md)
ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets pattern cursor)

typeset -A ZSH_HIGHLIGHT_STYLES

ZSH_HIGHLIGHT_STYLES[command]='fg=blue,bold'
ZSH_HIGHLIGHT_STYLES[function]='fg=blue,bold'
ZSH_HIGHLIGHT_STYLES[alias]='fg=blue,bold'
ZSH_HIGHLIGHT_STYLES[single-hyphen-option]='fg=yellow,bold'
ZSH_HIGHLIGHT_STYLES[double-hyphen-option]='fg=yellow,bold'
ZSH_HIGHLIGHT_STYLES[path]='fg=cyan'
ZSH_HIGHLIGHT_STYLES[unknown-token]='fg=magenta'

# asdf
[ -f ~/.asdf/asdf.sh ] && source ~/.asdf/asdf.sh
[ -f ~/.asdf/completions/asdf.bash ] && source ~/.asdf/completions/asdf.bash

# tabtab
[[ -f ~/.config/tabtab/__tabtab.zsh ]] && source ~/.config/tabtab/__tabtab.zsh

# Better autocompletion
autoload -U compinit
zmodload zsh/complist
zstyle ":completion:*" menu select
compinit

# <C-w> to edit line in editor
autoload edit-command-line
zle -N edit-command-line
bindkey '^w' edit-command-line

########## Aliases ##########

# alias: Expand with whitespace at the end
# balias: Expand without whitespace at the end
# ialias: Don't expand

balias c='clear'
alias s='startx'
balias clip="xclip -selection clipboard"
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

balias gc="git commit"
balias gca="git commit --amend"
alias gcm="git commit -m"
alias gC="git add -A && git commit -m"
alias gck="git checkout"
alias gckb="git checkout -b"
alias gckm="git checkout master"
alias gd="git diff"
alias gr="git remote"
alias grs="git reset --soft"
alias ga="git add"
balias ga.="git add ."
balias gaa="git add --all"
alias gf="git fetch"
balias gfa="git fetch --all"
balias gst="git status"
balias gsh"git stash"
alias gshp="git stash pop"
alias gshl="git stash list"
alias gps="git push"
alias gpsu="git push -u origin"
balias gpl="git pull"
balias gl="git log --graph --decorate --all"

alias tm="tmux"
alias tma="tmux attach-session"
alias tmd="tmux detach"
alias tmn="tmux new-session"
alias tmls="tmux ls"
alias tmks="tmux kill-session"
alias tmksv="tmux kill-server"

alias d="docker"
alias dc="docker container"
alias dcl="docker container ls"
alias dcr="docker container run"
alias dcrm="docker container rm"
alias dn="docker network"

alias gog="go get"
alias gor="go run"
alias gorm="go run main.go"
alias gob="go build"

balias i3c="$EDITOR ~/.config/i3/config"
balias vimc="$EDITOR ~/.vimrc"
balias pbc="$EDITOR ~/.config/polybar/config"
balias xrc="$EDITOR ~/.Xresources"
balias bsc="$EDITOR ~/.bashrc"
balias zshc="$EDITOR ~/.zshrc"
balias tmc="$EDITOR ~/.tmux.conf"

balias src="source $HOME/.zshrc"

ialias git="hub"
ialias cat="bat -p --theme='OneHalfDark'"
ialias sed='sed -E'
ialias vim="nvim"
ialias ls="exa"
ialias l="exa -l"
ialias grep="grep --color=auto"
ialias fzf="fzf --color=16 --preview 'bat --theme='base16' --style=numbers --color=always {}'"
ialias diff="diff --color=auto"

ialias dot="cd ~/.dotfiles"
ialias rdm="cd Dev/random"

########## Functions ##########

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

# Colorizes go test output
gotest(){
    go test $* | sed ''/PASS/s//$(printf "\033[32mPASS\033[0m")/'' | sed ''/FAIL/s//$(printf "\033[31mFAIL\033[0m")/''
}

bindkey -s '^o' 'lfcd\n'

eval "$(starship init zsh)"

source /home/shigueo/.config/broot/launcher/bash/br
