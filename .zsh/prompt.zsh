# VI Mode
bindkey -v
export KEYTIMEOUT=1
export BENRI_PREEXEC=$(date +"%s")

bindkey '^?' backward-delete-char
bindkey '^h' backward-delete-char

function precmd () {
    benri;
}

function preexec () {
    export BENRI_PREEXEC=$(date +"%s");
}

function set-prompt () {
    # 1: Blinking Block ("█")
    # 2: Steady Block ("█")
    # 3: Blinking Underline ("_")
    # 4: Underline ("_")
    # 5: Blinking bar ("|")
    # 6: Steady Bar ("|")
    local cursor_option="3"

    case ${KEYMAP} in
       # Change the cursor on visual mode
      (vicmd) SYMBOL=":" cursor_option="2";;
      (main|viins) SYMBOL="$" cursor_option="3" ;;
      (*) SYMBOL="$" cursor_option="3";;
    esac

    local cursor_seq="\x1b[\x3$cursor_option q"
	if [[ ! -z "${TMUX}" ]]; then
        cursor_seq="\ePtmux;\e$cursor_seq\e\\";
	fi
    echo -ne $cursor_seq

    PROMPT="%B%(?.%F{green}.%F{red})${SYMBOL}%f%b "
}

function zle-line-init zle-keymap-select {
    set-prompt
    zle reset-prompt
}

zle -N zle-line-init
zle -N zle-keymap-select
