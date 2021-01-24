#!/bin/sh

# If it's already installed...
if command -v yay &>/dev/null; then
    echo "yay already installed"
    exit
fi

git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si
