WORKING_DIR = $(PWD)

# List all files and remove git related ones
ALL_FILES := $(shell find . -path '*/.*' -type f -printf '%P\n' | grep -v git)

all: backup install


backup:
	@echo "Backing up current dotfiles to ~/.dotfiles.backup ..."
	@mkdir -p $(HOME)/.dotfiles.backup
	@for file in $(ALL_FILES); do \
		cp --dereference "$(HOME)/$$file" $(HOME)/.dotfiles.backup/; \
	done

install:
	@echo "Installing dotfiles ..."
	@for file in $(ALL_FILES); do \
		[ -f  "$(HOME)/$$file" ] && rm "$(HOME)/$$file"; \
		cp -s "$(WORKING_DIR)/$$file" "$(HOME)/$$file"; \
	done
