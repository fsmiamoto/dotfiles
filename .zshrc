# Path to your oh-my-zsh installation.
export ZSH="/home/shigueo/.oh-my-zsh"

ZSH_THEME="temaDaora"

plugins=(git zsh-syntax-highlighting zsh-vim-mode)

# Vim Mode
MODE_CURSOR_VIINS="blinking bar"

source $ZSH/oh-my-zsh.sh

## Aliases for programs
alias pac='sudo pacman'
alias oct="octave-cli"
alias trz='trizen'
alias py='python'
alias updt="sudo pacman -Syu"
alias arduino="arduino-cli"
alias inou="arduino-cli upload -p /dev/ttyACM0 --fqbn arduino:avr:mega"
alias inoc="arduino-cli compile --fqbn arduino:avr:mega"
alias vim="nvim"
alias sv="sudo $EDITOR"
alias v="$EDITOR"
alias sed='sed -E'
alias spkg="pacman -Ss"
alias dmenu="rofi-dmenu"


## Aliases for git
alias gitc="git commit -m"
alias gitck="git checkout"
alias gitr="git remote"
alias gita="git add"
alias gits="git status"
alias gitps="git push"
alias gitpl="git pull"
alias gitl="git log"

## Aliases for config files
alias i3c='$EDITOR ~/.config/i3/config'
alias vimc='$EDITOR ~/.vimrc'
alias pbc='$EDITOR ~/.config/polybar/config'
alias xrc='$EDITOR ~/.Xresources'
alias bsc='$EDITOR ~/.bashrc'
alias zshc="$EDITOR ~/.zshrc"
            
alias ankid="cd $HOME/.local/share/Anki2/"

# Removes all letters with marks
alias removeracentos='sed 'y/áÁàÀãÃâÂéÉêÊíÍóÓõÕôÔúÚçÇ/aAaAaAaAeEeEiIoOoOoOuUcC/'' 
######  Functions #######

# Creates a directory and cd's into it
mkd() { 
    mkdir $1 && cd $1 
}

# List my code directories with fzf and opens VS Code on the selected
dev() {
    pasta=$(ls -l "$HOME/Dev/" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf --color=16) &&  exec code $(echo "$HOME/Dev/$pasta")
}

devd() {
    pasta=$(ls -l "$HOME/Dev/" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf --color=16) &&  cd $(echo "$HOME/Dev/$pasta")
}

ml() {
    pasta=$(ls -l "$HOME/ML/MachineLearningCoursera" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf --color=16) && exec code $(echo "$HOME/ML/MachineLearningCoursera/$pasta")
}

# Lists my config files and opens it on $EDITOR
cfg() {
    file=$(du -a .config | awk '{print $2}' | fzf --color=16) && $EDITOR $file
}

# Stages everything and then commits
cmt(){
   test -n "$1" && git add -A && git commit -m "$1" && return 
   echo "Insira mensagem de commit cabeção!"
}

pdf(){
   zathura "$(find UTFPR | grep '\.pdf' | fzf --color=16)";
}

nihongo(){
    surf -f "http://jisho.org/search/$1"
}

## Alias expansion

# bindkey " " expand-alias-space

# expand-alias-space() {
#   [[ $LBUFFER =~ "\<(${(j:|:)baliases})\$" ]]; insertBlank=$?
#   if [[ ! $LBUFFER =~ "\<(${(j:|:)ialiases})\$" ]]; then
#     zle _expand_alias
#   fi
#   zle self-insert
#   if [[ "$insertBlank" = "0" ]]; then
#     zle backward-delete-char
#   fi
# }
# zle -N expand-alias-space
