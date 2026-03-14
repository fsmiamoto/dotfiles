alias pac="sudo pacman"
alias paci="sudo pacman -S"
alias pacs="pacman -Ss"
alias pacu="sudo pacman -Syu"
alias pacr="sudo pacman -Rsn"

pki() {
    pacman -Slq | fzf -m --preview 'pacman -Si {}' | xargs -ro sudo pacman -S
}

pky() {
    yay -Slq | fzf -m --preview 'yay -Si {}' | xargs -ro yay -S
}

pkr() {
    pacman -Qq | fzf -m --preview 'pacman -Qi {}' | xargs -ro sudo pacman -Rsn
}
