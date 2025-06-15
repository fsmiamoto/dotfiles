#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='ls --color=auto'
PS1='[\u@\h \W]\$ '

[ -f ~/.fzf.bash ] && source ~/.fzf.bash
eval "$(/opt/homebrew/bin/brew shellenv)"

export PATH=$HOME/.toolbox/bin:$PATH
. "$HOME/.cargo/env"
