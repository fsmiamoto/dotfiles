# ███████╗███████╗██╗  ██╗██████╗  ██████╗
# ╚══███╔╝██╔════╝██║  ██║██╔══██╗██╔════╝
#   ███╔╝ ███████╗███████║██████╔╝██║
#  ███╔╝  ╚════██║██╔══██║██╔══██╗██║
# ███████╗███████║██║  ██║██║  ██║╚██████╗
# ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝


# Plugins using Antidote
[ ! -f ~/.zsh/plugins.sh ] && source /usr/share/zsh-antidote/antidote.zsh && antidote bundle < ~/.zsh/plugins.txt > ~/.zsh/plugins.sh
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

# Profile
[ -f ~/.profile ] && source ~/.profile

[ -f /usr/share/z/z.sh ] && source /usr/share/z/z.sh

export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --no-messages -g "!{.git}"'
[ -f ~/.zsh/fzf.theme.zsh ] && source ~/.zsh/fzf.theme.zsh

# zsh-autosuggestions
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#a9a9a9"
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

# <C-f> to edit line in editor
autoload edit-command-line
zle -N edit-command-line
bindkey '^f' edit-command-line

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

alias s="sudo"
alias sx='startx'
alias clip="xclip -selection clipboard"
alias sv="sudo $EDITOR"

alias pac="sudo pacman"
alias paci="sudo pacman -S"
alias pacs="pacman -Ss"
alias pacu="sudo pacman -Syu"
alias pacr="sudo pacman -Rsn"

alias gomi='go mod init github.com/fsmiamoto/$(basename $PWD)'

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

alias t="tmux"
alias tt="tmux attach-session"
alias tk="tmux kill-session"
alias tls="tmux list-sessions"
alias ta="tmux attach-session -t"
alias td="tmux detach"
alias tkv="tmux kill-server"

alias tf="terraform"

alias d="docker"
alias dc="docker-compose"
alias dco="docker container"
alias dcol="docker container ls"
alias dcor="docker container run"
alias dcorm="docker container rm"
alias dn="docker network"
alias ds="sudo systemctl start docker.service"

alias kc="kubectl"

alias mk="make"
alias mki="sudo make install"

alias ka="killall"

alias chx="chmod +x"

alias rc="rclone"

balias vimc="$EDITOR ~/.config/nvim/init.lua"
balias zshc="$EDITOR ~/.zshrc"
balias tmc="$EDITOR ~/.config/.tmux.conf"

balias src="source $HOME/.zshrc"

ialias df='df -h'
ialias du='du -h'
ialias ip='ip -c'
ialias sed='sed -E'
ialias mkdir="mkdir -pv"
ialias fzf="fzf --color=16 --preview 'bat --style=numbers --color=always {}'"
ialias diff="diff --color=auto"
ialias c="clear"
ialias z="_z 2>&1"
ialias ls="exa"
ialias ll="exa -l"
ialias la="exa -la"
ialias l="exa -l"
ialias cat="bat"
ialias sctl="systemctl"
ialias psc='ps xawf -eo pid,user,cgroup,args'
ialias pls="sudo"
ialias gw="./gradlew"

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
    sudo pacman -S $(pacman -Ssq | fzf -m --preview="pacman -Si {}")
}

pkr() {
    sudo pacman -Rsn $(pacman -Qe | awk '{print $1}' | fzf -m --preview="yay -Si {}")
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

prck() {
  local pr_number=$(gh pr list | fzf --preview='gh pr view {1}'| awk '{print $1}')
  gh pr checkout "$pr_number" --detach
}

v() {
    if [ $# -eq 0 ]; then
        command "$EDITOR" "."
    else
        command "$EDITOR" "$@"
    fi
}

o() {
  xdg-open $1 & disown
  exit
}

n() {
  $EDITOR ~/notes/"$1.md"
}

vmhost() {
  local hostname="$1"
  local ip=$(virsh net-dhcp-leases default | grep "$1" | awk '{print $5}' | sed -E 's/^([0-9\.]+).*/\1/')
  printf "%s %s\n" "$ip" "$hostname" | sudo tee -a /etc/hosts
}

bindkey -s '^o' 'cd_with_fzf \n'

[ -f ~/vars.sh ] && source ~/vars.sh

[ -f ~/.zsh/priv.zsh ] && source ~/.zsh/priv.zsh

eval "$(starship init zsh)"
