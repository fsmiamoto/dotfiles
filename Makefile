WORKING_DIR = $(PWD)

# Detect OS
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	PACKAGE_MANAGER = brew
	PLATFORM_PACKAGE = macos
	PACKAGE_FILE = packages/Brewfile
else
	PACKAGE_MANAGER = sudo pacman -S
	PLATFORM_PACKAGE = linux
	PACKAGE_FILE = packages/pkglist.txt
endif

# Stow packages
COMMON_PACKAGES = common shell
VERBOSE ?= 0

config: backup scripts install

macos: packages config defaults

backup:
	@echo "Backing up current dotfiles to ~/.dotfiles.backup ..."
	@mkdir -p $(HOME)/.dotfiles.backup
	@# First backup files using stow packages to find what would be installed
	@for pkg in $(COMMON_PACKAGES) $(PLATFORM_PACKAGE); do \
		[ ! -d "$$pkg" ] && continue; \
		find "$$pkg" -type f | while read file; do \
			target="$(HOME)/$${file#*/}"; \
			[ -e "$$target" ] && cp "$$target" "$(HOME)/.dotfiles.backup/" 2>/dev/null || true; \
		done; \
	done
	@# Remove symlinks that might exist from previous stow installations
	@if command -v stow >/dev/null 2>&1; then \
		for pkg in $(COMMON_PACKAGES) $(PLATFORM_PACKAGE); do \
			[ ! -d "$$pkg" ] && continue; \
			stow -D $$pkg -t $(HOME) 2>/dev/null || true; \
		done; \
	fi

install:
	@echo "Installing dotfiles with stow..."
	@if ! command -v stow >/dev/null 2>&1; then \
		echo "Error: GNU Stow is not installed. Please install it first."; \
		echo "  macOS: brew install stow"; \
		echo "  Linux: sudo pacman -S stow (or equivalent)"; \
		exit 1; \
	fi
	@for pkg in $(COMMON_PACKAGES) $(PLATFORM_PACKAGE); do \
		[ ! -d "$$pkg" ] && continue; \
		[ $(VERBOSE) -ne 0 ] && echo "Stowing $$pkg"; \
		stow $$pkg -t $(HOME); \
	done

migrate:
	@echo "Migrating to stow-based dotfiles management..."
	@if ! command -v stow >/dev/null 2>&1; then \
		echo "Error: GNU Stow is not installed. Please install it first."; \
		echo "  macOS: brew install stow"; \
		echo "  Linux: sudo pacman -S stow (or equivalent)"; \
		exit 1; \
	fi
	@# Remove existing symlinks that point to old dotfiles structure
	@echo "Cleaning up old symlinks..."
	@find $(HOME) -maxdepth 3 -type l -exec sh -c 'readlink "$$1" | grep -q "\.dotfiles/\." && rm "$$1"' _ {} \; 2>/dev/null || true
	@# Remove empty directories that might be left behind
	@find $(HOME)/.config -type d -empty -delete 2>/dev/null || true
	@# Now install with stow
	@for pkg in $(COMMON_PACKAGES) $(PLATFORM_PACKAGE); do \
		[ ! -d "$$pkg" ] && continue; \
		[ $(VERBOSE) -ne 0 ] && echo "Stowing $$pkg"; \
		stow $$pkg -t $(HOME); \
	done

unstow:
	@echo "Removing dotfiles with stow..."
	@if command -v stow >/dev/null 2>&1; then \
		for pkg in $(COMMON_PACKAGES) $(PLATFORM_PACKAGE); do \
			[ ! -d "$$pkg" ] && continue; \
			[ $(VERBOSE) -ne 0 ] && echo "Unstowing $$pkg"; \
			stow -D $$pkg -t $(HOME); \
		done; \
	else \
		echo "Error: GNU Stow is not installed."; \
	fi

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
	@if [ -f $(PACKAGE_FILE) ]; then \
		brew bundle --file=$(PACKAGE_FILE); \
	else \
		echo "$(PACKAGE_FILE) not found, skipping package installation"; \
	fi
else
	$(PACKAGE_MANAGER) --needed - < $(PACKAGE_FILE)
endif

dump:
	@echo "Updating package list..."
ifeq ($(UNAME_S),Darwin)
	@brew bundle dump --file=$(PACKAGE_FILE) --force
	@echo "$(PACKAGE_FILE) updated with current packages"
else
	@pacman -Qqe > $(PACKAGE_FILE)
	@echo "$(PACKAGE_FILE) updated with current packages"
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

defaults:
ifeq ($(UNAME_S),Darwin)
	@echo "Updating MacOS defaults..."
	@defaults write NSGlobalDomain AppleShowAllExtensions -bool true
	@defaults write com.apple.dock autohide -bool true
	@defaults write NSGlobalDomain _HIHideMenuBar -bool true
	@defaults write com.apple.screencapture type -string "png"

	@defaults write com.apple.finder ShowExternalHardDrivesOnDesktop -bool false
	@defaults write com.apple.finder ShowHardDrivesOnDesktop -bool false
	@defaults write com.apple.finder ShowMountedServersOnDesktop -bool false
	@defaults write com.apple.finder ShowRemovableMediaOnDesktop -bool false
	@defaults write com.apple.Finder AppleShowAllFiles -bool true

	@defaults write net.ichi2.anki NSAppSleepDisabled -bool true
	@defaults write org.qt-project.Qt.QtWebEngineCore NSAppSleepDisabled -bool true

else
	@echo "Not on MacOS, skipping"
endif

.PHONY: backup install migrate unstow packages dump scripts config homebrew defaults
