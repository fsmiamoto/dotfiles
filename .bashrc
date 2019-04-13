
#  ██████╗  █████╗ ███████╗██╗  ██╗██████╗  ██████╗
#  ██╔══██╗██╔══██╗██╔════╝██║  ██║██╔══██╗██╔════╝
#  ██████╔╝███████║███████╗███████║██████╔╝██║     
#  ██╔══██╗██╔══██║╚════██║██╔══██║██╔══██╗██║     
#  ██████╔╝██║  ██║███████║██║  ██║██║  ██║╚██████╗
#  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝


[ -r /usr/share/bash-completion/bash_completion ] && . /usr/share/bash-completion/bash_completion

use_color=true

unset use_color safe_term match_lhs sh

alias ls='ls --color=auto'
alias grep='grep --colour=auto'
alias egrep='egrep --colour=auto'
alias fgrep='fgrep --colour=auto'
alias cp="cp -i"                          # confirm before overwriting something
alias df='df -h'                          # human-readable sizes
alias free='free -m'                      # show sizes in MB
alias np='nano -w PKGBUILD'
alias more=less
alias code="exec code"

xhost +local:root > /dev/null 2>&1

complete -cf sudo

# Bash won't get SIGWINCH if another process is in the foreground.
# Enable checkwinsize so that bash will check the terminal size when
# it regains control.  #65623
# http://cnswww.cns.cwru.edu/~chet/bash/FAQ (E11)
shopt -s checkwinsize

shopt -s expand_aliases

# export QT_SELECT=4

# Enable history appending instead of overwriting.  #139609
shopt -s histappend


# better yaourt colors
export YAOURT_COLORS="nb=1:pkg=1:ver=1;32:lver=1;45:installed=1;42:grp=1;34:od=1;41;5:votes=1;44:dsc=0:other=1;35"

# MY STUFF

# Bash prompt
export PS1='\[\033[1;31m\]\W\[\033[1;34m\]:\[\033[m\] '

# Set bash to VI mode
set -o vi

# Aliases for programs
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

# Aliases for git
alias gitc="git commit -m"
alias gita="git add"
alias gits="git status"
alias gitps="git push"
alias gitpl="git pull"
alias gitl="git log"

# Aliases for config files
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

cfg() {
    file=$(du -a .config | awk '{print $2}' | fzf) && $EDITOR $file
}

cmt(){
   test -n "$1" && git add -A && git commit -m "$1" && return 
   echo "Insira mensagem de commit cabeção!"
}


ytmusic(){
    youtube-dl -f 'bestaudio[ext=m4a]' -o "Music/$1.m4a" "$2"
}

colors() {
	local fgc bgc vals seq0

	printf "Color escapes are %s\n" '\e[${value};...;${value}m'
	printf "Values 30..37 are \e[33mforeground colors\e[m\n"
	printf "Values 40..47 are \e[43mbackground colors\e[m\n"
	printf "Value  1 gives a  \e[1mbold-faced look\e[m\n\n"

	# foreground colors
	for fgc in {30..37}; do
		# background colors
		for bgc in {40..47}; do
			fgc=${fgc#37} # white
			bgc=${bgc#40} # black

			vals="${fgc:+$fgc;}${bgc}"
			vals=${vals%%;}

			seq0="${vals:+\e[${vals}m}"
			printf "  %-9s" "${seq0:-(default)}"
			printf " ${seq0}TEXT\e[m"
			printf " \e[${vals:+${vals+$vals;}}1mBOLD\e[m"
		done
		echo; echo
	done
}

# # ex - archive extractor
# # usage: ex <file>
ex ()
{
  if [ -f $1 ] ; then
    case $1 in
      *.tar.bz2)   tar xjf $1   ;;
      *.tar.gz)    tar xzf $1   ;;
      *.bz2)       bunzip2 $1   ;;
      *.rar)       unrar x $1     ;;
      *.gz)        gunzip $1    ;;
      *.tar)       tar xf $1    ;;
      *.tbz2)      tar xjf $1   ;;
      *.tgz)       tar xzf $1   ;;
      *.zip)       unzip $1     ;;
      *.Z)         uncompress $1;;
      *.7z)        7z x $1      ;;
      *)           echo "'$1' cannot be extracted via ex()" ;;
    esac
  else
    echo "'$1' is not a valid file"
  fi
}

# fzf
[ -f ~/.fzf.bash ] && source ~/.fzf.bash


# >>> conda initialize >>>
# !! Contents within this block are managed by 'conda init' !!
__conda_setup="$('/home/shigueo/anaconda3/bin/conda' 'shell.bash' 'hook' 2> /dev/null)"
if [ $? -eq 0 ]; then
    eval "$__conda_setup"
else
    if [ -f "/home/shigueo/anaconda3/etc/profile.d/conda.sh" ]; then
        . "/home/shigueo/anaconda3/etc/profile.d/conda.sh"
    else
        export PATH="/home/shigueo/anaconda3/bin:$PATH"
    fi
fi
unset __conda_setup
# <<< conda initialize <<<

