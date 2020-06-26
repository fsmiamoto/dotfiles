# dotfiles

This repo contains my config files, a.k.a dotfiles, that I change probably more than I should.

###

- Distro: Arch Linux
- WM: dwm
- Notifications: dunst
- Shell: zsh
- Terminal Emulator: st
- File manager: lf
- Editor: Neovim

Colorscheme generated with PyWal

### Installing

```sh
    # Clone the repo
    $ git clone git@github.com/fsmiamoto/dotfiles ~/.dotfiles
    $ cd ~/.dotfiles

    # Installs dotfiles with backup of current ones in $HOME/.dotfiles.backup
    $ make

    # You can also run the steps separately
    $ make backup
    $ make install
```

### Todo's

- Add command to Makefile for restoring backed up dotfiles
