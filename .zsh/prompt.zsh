# VI Mode
bindkey -v
export KEYTIMEOUT=1
export BENRI_PREEXEC=$(date +"%s")

bindkey '^?' backward-delete-char
bindkey '^h' backward-delete-char

preexec () { export BENRI_PREEXEC=$(date +"%s"); }

autoload -Uz vcs_info
zstyle ':vcs_info:*' enable git
local formats="%c%u"
local actionformats="${formats}%F{red}%a "

zstyle ':vcs_info:*:*' formats           $formats
zstyle ':vcs_info:*:*' actionformats     $actionformats
zstyle ':vcs_info:*:*' stagedstr         "%F{green}•"
zstyle ':vcs_info:*:*' unstagedstr       "%F{yellow}•"
zstyle ':vcs_info:*:*' check-for-changes true

function precmd () {
    $(go env GOBIN)/benri
    vcs_info
}

function set-prompt () {
    case ${KEYMAP} in
      (vicmd)      SYMBOL="!" ;;
      (main|viins) SYMBOL="$" ;;
      (*)          SYMBOL="$" ;;
    esac

    # 2: Block ("█")
    # 4: Underline ("_")
    # 6: Bar ("|")
	if [[ -z "${TMUX}" ]]; then
		local cursor_seq="\e[2 q"
	else
		local cursor_seq="\ePtmux;\e\e[2 q\e\\"
	fi

    echo -ne $cursor_seq
    PROMPT="%(?.%F{green}.%F{red})${SYMBOL}%f "
    RPROMPT="%B${vcs_info_msg_0_} %F{grey}$(date +'%H:%M')%F{none}"
}

function zle-line-init zle-keymap-select {
    set-prompt
    zle reset-prompt
}

zle -N zle-line-init
zle -N zle-keymap-select
add-zsh-hook precmd vcs_info
