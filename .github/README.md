# dotfiles

This repository contains my configuration files - a.k.a dotfiles - that I change probably more than I should.

It also contains some helper targets to install packages and set other system configs.

Take a look at the Makefile for more details.

- OS: MacOS
- WM: aerospace
- Shell: zsh
- Terminal Emulator: ghostty
- File manager: lf
- Editor: Neovim

### Installing

```sh
    # Clone the repo
    $ git clone git@github.com/fsmiamoto/dotfiles ~/.dotfiles
    $ cd ~/.dotfiles

    # Installs packages and dotfiles 
    $ make

    # You can also run the steps separately
    $ make macos
    $ make packages
```

![Preview](./setup.png)
