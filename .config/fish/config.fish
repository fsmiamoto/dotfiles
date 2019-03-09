fish_vi_key_bindings

set fish_greeting # Disable greeting

#################### ALIASES #################### 

# Program aliases
alias pac='sudo pacman'
alias trz='trizen'
alias gitp="git push"
alias py='python'
alias updt="sudo pacman -Syu"
alias arduino="arduino-cli"
alias inou="arduino-cli upload -p /dev/ttyACM0 --fqbn arduino:avr:mega"
alias inoc="arduino-cli compile --fqbn arduino:avr:mega"
alias sv='sudo nvim'
alias v='nvim'
alias sed='sed -E'
alias removeracentos='sed 'y/áÁàÀãÃâÂéÉêÊíÍóÓõÕôÔúÚçÇ/aAaAaAaAeEeEiIoOoOoOuUcC/'' 

# Config files
alias i3c='$EDITOR ~/.config/i3/config'
alias fishc='$EDITOR ~/.config/fish/config.fish'
alias vimc='$EDITOR ~/.vimrc'
alias pbc='$EDITOR ~/.config/polybar/config'
alias xrc='$EDITOR ~/.Xresources'
alias bsc='$EDITOR ~/.bashrc'

#################### FUNCTIONS #################### 

function dev 
    set pasta (ls -l "$HOME/Dev/" | grep "^d" | sed -nE 's/^.*[0-9] (.*)$/\1/p' | sed -n 's/^.*$/&\//p' | fzf) && exec code (echo "$HOME/Dev/$pasta")
end

function devd
    set pasta (ls -l "$HOME/Dev/" | grep "^d" | sed -nE 's/^.*[0-9] (.*)$/\1/p' | sed -n 's/^.*$/&\//p' | fzf) && cd (echo "$HOME/Dev/$pasta")
end

function ml 
    set pasta (ls -l "/home/shigueo/ML/MachineLearningCoursera" | grep "^d" | sed -nE 's/^.*[0-9] (.*)$/\1/p' | sed -n 's/^.*$/&\//p' | fzf) && exec code (echo "$HOME/ML/MachineLearningCoursera/$pasta")
end

# Creates a directory and cd's into it
function mkd
    command mkdir $argv
    if test $status = 0
        switch $argv[(count $argv)]
            case '-*'

            case '*'
                cd $argv[(count $argv)]
                return
        end
    end
end

function cfg
    set file (du -a .config | awk '{print $2}' | fzf) && $EDITOR $file
end
