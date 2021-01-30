WORKING_DIR = $(PWD)

# List all files and remove git related ones
ALL_FILES := $(shell find . -path '*/.*' -type f -printf '%P\n' | grep -v git)

all: backup install packages yay benri

backup:
	@echo "Backing up current dotfiles to ~/.dotfiles.backup ..."
	@mkdir -p $(HOME)/.dotfiles.backup
	@for file in $(ALL_FILES); do \
	   [ ! -e "$(HOME)/$$file" ] && continue; \
	   cp --dereference "$(HOME)/$$file" $(HOME)/.dotfiles.backup/; \
	done

install:
	@echo "Installing dotfiles ..."
	@for file in $(ALL_FILES); do \
		[ -f  "$(HOME)/$$file" ] && rm "$(HOME)/$$file"; \
		dir=$$(dirname "$(HOME)/$$file");\
		[ ! -d $$dir ] && mkdir -p $$dir;\
		cp -s "$(WORKING_DIR)/$$file" "$(HOME)/$$file"; \
	done

packages:
	@echo "Installing packages..."
	@sudo pacman -S --needed - < pkglist.txt

yay:
	@echo "Installing Yay..."
	@./install_yay.sh
	@echo "Installing Yay Pacages..."
	@yay -S --needed - < yaylist.txt

benri:
	@echo "Installing Benri..."
	git clone "https://github.com/fsmiamoto/benri.git"
	cd benri && sudo make install
