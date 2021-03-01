# dotfiles

This repo contains my config files, a.k.a dotfiles, that I change probably more than I should.

It also contains some helper files for bootstraping an Arch-based environment with 
my most used packages.

You can take a look at the Makefile for more details.

### Include

- Distro: Arch Linux
- WM: dwm
- Notifications: dunst
- Shell: zsh
- Prompt: [Benri](https://github.com/fsmiamoto/benri)
- Terminal Emulator: st
- File manager: lf
- Editor: Neovim

Colorscheme generated with PyWal

### Installing

```sh
    # Clone the repo
    $ git clone git@github.com/fsmiamoto/dotfiles ~/.dotfiles
    $ cd ~/.dotfiles

    # Installs packages and dotfiles 
    $ make

    # You can also run the steps separately
    $ make install
    $ make packages
    $ make yay

    # Install packages for graphical environment
    $ make xorg

    # Backup your curent dotfiles to avoid losing anything
    $ make backup
```

![Preview](./setup.png)
