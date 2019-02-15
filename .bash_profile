#
# ~/.bash_profile
#

[[ -f ~/.bashrc ]] && . ~/.bashrc

# Export variables
export EDITOR=vim
export PATH="${PATH}:${HOME}/.local/bin/:${HOME}/bin/"
export BROWSER=firefox

# Set bash to VI mode
set -o vi

# Aliases
alias spac='sudo pacman'
alias py='python'

# Bash prompt
export PS1="\[\033[38;5;100m\][\[$(tput bold)\]\[$(tput sgr0)\]\[\033[38;5;4m\]\u\[$(tput sgr0)\]\[\033[38;5;5m\]@\[$(tput sgr0)\]\[\033[38;5;29m\]\h\[$(tput sgr0)\]\[$(tput sgr0)\]\[\033[38;5;15m\] \[$(tput sgr0)\]\[\033[38;5;1m\]\W\[$(tput sgr0)\]\[\033[38;5;100m\]]\[$(tput sgr0)\]\[\033[38;5;15m\]\\$ \[$(tput sgr0)\]"

export PATH="$HOME/.cargo/bin:$PATH"
