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
[ -f ~/.fzf/shell/completion.zsh ] && source ~/.fzf/shell/completion.zsh
[ -f ~/.fzf/shell/key-bindings.zsh ] && source ~/.fzf/shell/key-bindings.zsh

# asdf
[ -f ~/.asdf/asdf.sh ] && source ~/.asdf/asdf.sh

# My prompt
[ -f ~/.zsh/prompt.zsh ] && source ~/.zsh/prompt.zsh

[ -f /usr/share/z/z.sh ] && source /usr/share/z/z.sh

export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --no-messages -g "!{.git}"'
[ -f ~/.zsh/fzf.theme.zsh ] && source ~/.zsh/fzf.theme.zsh

# zsh-autosuggestions
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=1"
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
if [ $(date +'%j') != $(date -r ~/.zcompdump '+%j') ]; then
  compinit
else
  compinit -C
fi

# <C-w> to edit line in editor
autoload edit-command-line
zle -N edit-command-line
bindkey '^w' edit-command-line

# cd without cd
setopt auto_cd

# Disable <C-s> for freezing the terminal
stty stop undef

export HISTFILE=$HOME/.zsh_history
export HISTSIZE=950000
export SAVEHIST=950000

########## Aliases ##########

# alias: Expand with whitespace at the end
# balias: Expand without whitespace at the end
# ialias: Don't expand

alias s='startx'
alias clip="xclip -selection clipboard"
alias oct="octave-cli"
alias py='python'
alias ino="arduino-cli"
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
alias gl="git log --graph --decorate --all --oneline"
alias glo="git log --graph --decorate --all"

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
alias tls="tmux list-sessions"
alias tma="tmux attach-session -t"
alias tmd="tmux detach"
alias tmn="tmux new-session"
alias tmls="tmux ls"
alias tmks="tmux kill-session"
alias tmksv="tmux kill-server"

alias d="docker"
alias dc="docker-compose"
alias dco="docker container"
alias dcol="docker container ls"
alias dcor="docker container run"
alias dcorm="docker container rm"
alias dn="docker network"

alias kc="kubectl"

alias gog="go get"
alias gor="go run"
alias gorm="go run main.go"
alias gob="go build"

alias mk="make"
alias mki="sudo make install"

alias ka="killall"

alias chx="chmod +x"

alias rc="rclone"

alias pa="php artisan"

ialias o="xdg-open"

balias vimc="$EDITOR ~/.dotfiles/.vimrc"
balias zshc="$EDITOR ~/.dotfiles/.zshrc"
balias tmc="$EDITOR ~/.dotfiles/.tmux.conf"

balias src="source $HOME/.zshrc"

ialias sed='sed -E'
ialias mkdir="mkdir -pv"
ialias fzf="fzf --color=16 --preview 'bat --style=numbers --color=always {}'"
ialias diff="diff --color=auto"
ialias vlang="/usr/bin/v"
ialias c="clear"
ialias z="_z 2>&1"

ialias ls="exa"
ialias ll="exa -l"
ialias l="exa -l"
ialias cat="bat"


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

# Credit to github.com/connermcd
pi() {
    [ "$1" = "-u" ] && sudo pacman -Sy
    sudo pacman -S $(pacman -Ssq | fzf -m --preview="pacman -Si {}")
}

open_with_fzf() {
    fd -t f -H -I | fzf -m --preview="xdg-mime query default {}" | xargs -ro -d "\n" xdg-open 2>&-
}

cd_with_fzf() {
    local exclude="go"
    local dir="$(fd -t d --exclude ${exclude} | fzf --preview="tree -L 1 {}")"
    cd "$dir"
}

rs() {
	rsync -avzrP $@
}

todo() {
	local file="todo-$(date +"%Y-%m-%d").md"
	nb search "$file" > /dev/null 2>&1 || nb add "$file" -c " " > /dev/null
	echo "- $@"| nb edit "$file"
}

pw() {
	file=$(fd . '.password-store/' -e '.gpg' | sed 's!\.password-store/!!g; s!\.gpg!!g' | fzf)
	pass show $file | tr -d '\n' |clip
	echo "Copied password to clipboard"
}

dsync(){
	cd $HOME/drive/fsmiamoto
	rclone  sync -L -P . drive_fsmiamoto_crypt:
}

bindkey -s '^o' 'cd_with_fzf \n'

[ -f ~/vars.sh ] && source ~/vars.sh
