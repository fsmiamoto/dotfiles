# Path to your oh-my-zsh installation.
export ZSH="/home/shigueo/.oh-my-zsh"

ZSH_THEME="temaDaora"

plugins=(git zsh-syntax-highlighting zsh-vimto)

source $ZSH/oh-my-zsh.sh

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

## Aliases
alias pac='sudo pacman'
alias clip="xclip -selection clipboard"
alias oct="octave-cli"
alias py='python'
alias arduino="arduino-cli"
alias sv="sudo $EDITOR"
alias v="$EDITOR"
alias trt="transmission-remote-cli"

alias spkg="pacman -Ss"
alias updt="sudo pacman -Syu"

alias gitc="git commit -m"
alias gitck="git checkout"
alias gitr="git remote"
alias gita="git add"
alias gits="git status"
alias gitst="git stash"
alias gitps="git push"
alias gitpl="git pull"
alias gitl="git log"

alias i3c='$EDITOR ~/.config/i3/config'
alias vimc='$EDITOR ~/.vimrc'
alias pbc='$EDITOR ~/.config/polybar/config'
alias xrc='$EDITOR ~/.Xresources'
alias bsc='$EDITOR ~/.bashrc'
alias zshc="$EDITOR ~/.zshrc"
            
# Removes all letters with marks
alias removeracentos='sed 'y/áÁàÀãÃâÂéÉêÊíÍóÓõÕôÔúÚçÇ/aAaAaAaAeEeEiIoOoOoOuUcC/'' 
######  Functions #######

# Creates a directory and cd's into it
mkd() { 
    mkdir $1 && cd $1 
}

# List my code directories with fzf and opens VS Code on the selected
dev() {
    pasta=$(ls -l "$HOME/Dev/" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf  --prompt='Choose a project: ') &&  exec code $(echo "$HOME/Dev/$pasta")
}

devd() {
    pasta=$(ls -l "$HOME/Dev/" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf ) &&  cd $(echo "$HOME/Dev/$pasta")
}

ml() {
    pasta=$(ls -l "$HOME/ML/MachineLearningCoursera" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf ) && exec code $(echo "$HOME/ML/MachineLearningCoursera/$pasta")
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

nihongo(){
    surf -f "http://jisho.org/search/$1"
}

get-thumbnail(){
    ffmpeg  -itsoffset -105 -i $1 -vcodec mjpeg -vframes 1 -an -f rawvideo -s 300x300 $2;
}

anime(){
    anime_dir="$HOME/Video/Anime"
    choosen_anime=$(find "$anime_dir/" | cut -d / -f 6 | uniq | fzf --color=16 --prompt='Choose an Anime: ')
    choosen_episode=$(find "$anime_dir/$choosen_anime/" -type f | sed "s/^.*\/(.*)$/\1/g"| sort | fzf  --prompt='Choose an Episode: ') 
    mpv "$anime_dir/$choosen_anime/$choosen_episode" & disown;
    exit
}


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
ialias grep="grep --color=auto"
ialias fzf="fzf --color=16"
