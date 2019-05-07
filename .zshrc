# Path to your oh-my-zsh installation.
export ZSH="/home/shigueo/.oh-my-zsh"

ZSH_THEME="robbyrussell"

plugins=(git zsh-syntax-highlighting)

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

## Aliases for git
alias gitc="git commit -m"
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
            
alias ankid="cd $HOME/.local/share/Anki2/"

# Remove todos os acentos usando o sed
alias removeracentos='sed 'y/áÁàÀãÃâÂéÉêÊíÍóÓõÕôÔúÚçÇ/aAaAaAaAeEeEiIoOoOoOuUcC/'' 

######  Functions #######

# Cria diretório e então muda pra lá
mkd() { 
    mkdir $1 && cd $1 
}

# Mostra diretórios e abre VS Code no selecionado
dev() {
    pasta=$(ls -l "$HOME/Dev/" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf) &&  exec code $(echo "$HOME/Dev/$pasta")
}

devd() {
    pasta=$(ls -l "$HOME/Dev/" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf) &&  cd $(echo "$HOME/Dev/$pasta")
}

ml() {
    pasta=$(ls -l "$HOME/ML/MachineLearningCoursera" | grep "^d" | sed -nE "s/^.*[0-9] (.*)$/\1/p" | sed -n "s/^.*$/&\//p" | fzf) && exec code $(echo "$HOME/ML/MachineLearningCoursera/$pasta")
}

# Abre fzf com arquivos de configuração
cfg() {
    file=$(du -a .config | awk '{print $2}' | fzf) && $EDITOR $file
}

# Adiciona tudo e commita
cmt(){
   test -n "$1" && git add -A && git commit -m "$1" && return 
   echo "Insira mensagem de commit cabeção!"
}
