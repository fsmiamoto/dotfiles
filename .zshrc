# ███████╗███████╗██╗  ██╗██████╗  ██████╗
# ╚══███╔╝██╔════╝██║  ██║██╔══██╗██╔════╝
#   ███╔╝ ███████╗███████║██████╔╝██║
#  ███╔╝  ╚════██║██╔══██║██╔══██╗██║
# ███████╗███████║██║  ██║██║  ██║╚██████╗
# ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝

# Plugins using Antibody
[ ! -f ~/.zsh/plugins.sh ] && antibody bundle < ~/.zsh/plugins.txt > ~/.zsh/plugins.sh
source ~/.zsh/plugins.sh

# Alias expansion
[ -f ~/.zsh/alias_expansion.zsh ] && source ~/.zsh/alias_expansion.zsh

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# asdf
[ -f ~/.asdf/asdf.sh ] && source ~/.asdf/asdf.sh

# My prompt
[ -f ~/.zsh/prompt.zsh ] && source ~/.zsh/prompt.zsh

export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --no-messages -g "!{.git}"'

# zsh-autosuggestions
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#4f4f4f"
ZSH_AUTOSUGGEST_STRATEGY=(history)
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

# Better autocompletion
zmodload zsh/complist
zstyle ":completion:*" menu select
autoload -Uz compinit
if [[ -n ${ZDOTDIR}/.zcompdump(#qN.mh+24) ]]; then
	compinit;
else
	compinit -C;
fi;

# <C-w> to edit line in editor
autoload edit-command-line
zle -N edit-command-line
bindkey '^w' edit-command-line

# cd without cd
setopt auto_cd

# Disable ctrl-s to freeze terminal.
stty stop undef

export HISTFILE=$HOME/.zsh_history
export HISTSIZE=950000
export SAVEHIST=950000

########## Aliases ##########

# alias: Expand with whitespace at the end
# balias: Expand without whitespace at the end
# ialias: Don't expand

alias c='clear'
alias s='startx'
alias clip="xclip -selection clipboard"
alias oct="octave-cli"
alias py='python'
alias arduino="arduino-cli"
alias sv="sudo $EDITOR"
alias trt="transmission-remote-cli"
alias v.="$EDITOR ."
alias v="$EDITOR"

alias pyenv="source env/bin/activate"

alias pac="sudo pacman"
alias paci="sudo pacman -S"
alias pacs="pacman -Ss"
alias pacu="sudo pacman -Syu"
alias pacr="sudo pacman -Rsn"

alias g="git"
alias gc="git commit"
alias gb="git branch"
alias gbd="git branch -d"
alias gbD="git branch -D"
alias gca="git commit --amend"
alias gcm="git commit -m"
alias gC="git add -A && git commit -m"
alias gck="git checkout"
alias gckb="git checkout -b"
alias gckm="git checkout master"
alias gd="git diff"
alias gr="git remote"
alias grb="git rebase"
alias grs="git reset --soft"
alias ga="git add"
alias ga.="git add ."
alias gaa="git add --all"
alias gf="git fetch"
alias gfp="git fetch --prune"
alias gfa="git fetch --all"
alias gst="git status"
alias gsh="git stash"
alias gshp="git stash pop"
alias gshl="git stash list"
alias gps="git push"
alias gpsu="git push -u origin"
alias gpl="git pull"
alias gl="git log --graph --decorate --all"

alias gi="gh issue"
alias gil="gh issue list"
alias gic="gh issue create"
alias giv="gh issue view"

alias gpr="gh pr"
alias gprc="gh pr create"
alias gprl="gh pr list"
alias gprv="gh pr view"

alias lg='lazygit'

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

alias mk="make"
alias mki="sudo make install"

alias ka="killall"

alias chx="chmod +x"

balias vimc="$EDITOR ~/.dotfiles/.vimrc"
balias zshc="$EDITOR ~/.dotfiles/.zshrc"
balias tmc="$EDITOR ~/.dotfiles/.tmux.conf"

balias src="source $HOME/.zshrc"

ialias mkdir="mkdir -p"
ialias cat="bat"
ialias sed='sed -E'
ialias vim="nvim"
ialias ls="exa"
ialias l="exa -l"
ialias grep="rg"
ialias find="fd"
ialias fzf="fzf --color=16 --preview 'bat --style=numbers --color=always {}'"
ialias diff="diff --color=auto"
ialias vlang="/usr/bin/v"
ialias mkdir="mkdir -pv"

ialias dot="cd ~/.dotfiles"
ialias scs="cd ~/.scripts"

########## Functions ##########

# Auto ls when cd'ing
chpwd(){
    emulate -L zsh
    ls --group-directories-first
}

# Creates a directory and cd's into it
mkd() {
    mkdir $1 && cd $1
}

# Kill a process
k(){
    pid=$(ps -exo 'user,pid,cmd' | sed '1d' | fzf --preview-window=hidden |  awk '{printf $2}')

    if [ "$1" != "" ]; then
        kill -"$1" "$pid"
    else
        kill "$pid"
    fi
}

# Colorizes go test output
gotest(){
    go test $* | sed ''/PASS/s//$(printf "\033[32mPASS\033[0m")/'' | sed ''/FAIL/s//$(printf "\033[31mFAIL\033[0m")/''
}

# Lists my config files and opens it on $EDITOR
cfg() {
    file=$( fd -t f . "$HOME/.config" | fzf ) && $EDITOR $file
}

clone(){
    test -n "$1" && cd $PROJECT_DIR > /dev/null && git clone $1
    echo "Missing repository URL"
}

ide(){
    tmux split-window -h -p 35
    tmux split-window -v -p 60
    tmux select-pane -L
    $EDITOR .
}

# Credit to github.com/connermcd
pi() {
    [ "$1" = "-u" ] && sudo pacman -Sy
    sudo pacman -S $(pacman -Ssq | fzf -m --preview="pacman -Si {}")
}

open_with_fzf() {
    fd -t f -H -I | fzf -m --preview="xdg-mime query default {}" | xargs -ro -d "\n" xdg-open 2>&-
}

cd_with_fzf() {
    if [ "$1" != "-r" ] && cd $HOME > /dev/null
    cd "$(fd -t d | fzf --preview="tree -L 1 {}")"
}

bindkey -s '^O' 'cd_with_fzf\n'
bindkey -s '^o' 'cd_with_fzf -r\n'
