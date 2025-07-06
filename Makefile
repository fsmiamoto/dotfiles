WORKING_DIR = $(PWD)

# Detect OS
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	PACKAGE_MANAGER = brew
	COPY_OPTS = -L
else
	PACKAGE_MANAGER = sudo pacman -S
	COPY_OPTS = --dereference
endif

# List all files and remove git related ones
FILES := $(shell find . -type f | grep -v '\.git' | sed 's/^.\///g' | grep -E '^(Library|\.)')
LINKS := $(shell find . -type l  | grep -v '\.git'| sed 's/^.\///g' | grep -E '^(Library|\.)')
VERBOSE ?= 0

config: backup scripts install

macos: packages config

backup:
	@echo "Backing up current dotfiles to ~/.dotfiles.backup ..."
	@mkdir -p $(HOME)/.dotfiles.backup
	@for file in $(FILES) $(LINKS); do \
	   [ ! -e "$(HOME)/$$file" ] && continue; \
	   cp $(COPY_OPTS) "$(HOME)/$$file" $(HOME)/.dotfiles.backup/; \
	done

install:
	@echo "Installing dotfiles ..."
	@for file in $(FILES) $(LINKS); do \
		[ $(VERBOSE) -ne 0 ] && echo "Installing $$file"; \
		[ -f  "$(HOME)/$$file" ] && rm "$(HOME)/$$file"; \
		dir=$$(dirname "$(HOME)/$$file");\
		[ ! -d $$dir ] && mkdir -p $$dir;\
		ln -sf "$(WORKING_DIR)/$$file" "$(HOME)/$$file"; \
	done

scripts:
	@echo "Installing my scripts..."
	@if [ ! -d ~/.scripts ]; then \
		git clone https://github.com/fsmiamoto/scripts.git ~/.scripts; \
	else \
		echo "Scripts directory already exists, skipping..."; \
	fi

packages:
	@echo "Installing packages..."
ifeq ($(UNAME_S),Darwin)
	@if [ -f Brewfile ]; then \
		brew bundle --file=Brewfile; \
	else \
		echo "Brewfile not found, skipping package installation"; \
	fi
else
	$(PACKAGE_MANAGER) --needed - < pkglist.txt
endif

dump:
	@echo "Updating package list..."
ifeq ($(UNAME_S),Darwin)
	@brew bundle dump --file=Brewfile --force
	@echo "Brewfile updated with current packages"
else
	@pacman -Qqe > pkglist.txt
	@echo "pkglist.txt updated with current packages"
endif

homebrew:
	@echo "Installing Homebrew..."
ifeq ($(UNAME_S),Darwin)
	@if command -v brew >/dev/null 2>&1; then \
		echo "Homebrew already installed"; \
	else \
		/bin/bash -c "$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"; \
	fi
else
	@echo "Homebrew installation is only supported on macOS"
endif

.PHONY: backup install packages dump scripts config homebrew
