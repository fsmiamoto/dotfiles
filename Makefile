WORKING_DIR = $(PWD)

# List all files and remove git related ones
ALL_FILES := $(shell find . -path '*/.*' -type f,l | grep -v \.git | sed 's/^\.\///')

all: install scripts benri plug

# TODO:Fixthis
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
		ln -s "$(WORKING_DIR)/$$file" "$(HOME)/$$file"; \
	done


scripts:
	@echo "Installing my scripts..."
	git clone https://github.com/fsmiamoto/scripts.git ~/.scripts

plug:
	nvim --headless +PlugInstall +qa

benri:
	@echo "Installing Benri..."
	git clone https://github.com/fsmiamoto/benri.git
	cd benri && sudo make install
	@echo "Removing benri clone"
	rm -rf benri
