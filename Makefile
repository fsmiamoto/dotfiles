WORKING_DIR = $(PWD)

# List all files and remove git related ones
ALL_FILES := $(shell find . -path '*/.*' -type f,l -printf '%P\n' | grep -v '\.git')
VERBOSE ?= 0

all: backup install packages yay scripts benri plug

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
		[ $(VERBOSE) -ne 0 ] && echo "Installing $$file"; \
		[ -f  "$(HOME)/$$file" ] && rm "$(HOME)/$$file"; \
		dir=$$(dirname "$(HOME)/$$file");\
		[ ! -d $$dir ] && mkdir -p $$dir;\
		cp -as "$(WORKING_DIR)/$$file" "$(HOME)/$$file"; \
	done

scripts:
	@echo "Installing my scripts..."
	git clone https://github.com/fsmiamoto/scripts.git ~/.scripts

xorg:
	@echo "Installing XOrg packages..."
	sudo pacman -S --needed - < xorg-pkglist.txt
	yay -S --needed - < xorg-yaylist.txt
	$(MAKE) dwm
	$(MAKE) dwmblocks
	$(MAKE) st

packages:
	@echo "Installing packages..."
	sudo pacman -S --needed - < pkglist.txt

yay:
	@echo "Installing Yay..."
	./install_yay.sh
	@echo "Installing Yay Pacages..."
	yay -S --needed - < yaylist.txt
	@echo "Removing yay clone"
	rm -rf yay

plug:
	nvim --headless +PlugInstall +qa

benri:
	@echo "Installing Benri..."
	git clone https://github.com/fsmiamoto/benri.git
	cd benri && sudo make install
	@echo "Removing benri clone"
	rm -rf benri

st:
	@echo "Installing st..."
	git clone https://github.com/fsmiamoto/st.git
	cd st && make && sudo make install
	@echo "Removing st clone"
	rm -rf st

dwm:
	@echo "Installing dwm..."
	git clone https://github.com/fsmiamoto/dwm.git
	cd dwm && make && sudo make install
	@echo "Removing dwm clone"
	rm -rf dwm

dwmblocks:
	@echo "Installing dwmblocks..."
	git clone https://github.com/fsmiamoto/dwmblocks.git
	cd dwmblocks && make && sudo make install
	@echo "Removing dwmblocks clone"
	rm -rf dwmblocks
