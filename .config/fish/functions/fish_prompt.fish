function fish_prompt
	if not set -q VIRTUAL_ENV_DISABLE_PROMPT
        set -g VIRTUAL_ENV_DISABLE_PROMPT true
    end
    
    set_color -o red
    printf '%s' (prompt_pwd)
    set_color magenta
    printf ' at '
    set_color $fish_color_cwd
    printf '%s' (git rev-parse --abbrev-ref HEAD)
    set_color yellow
    printf ': '
    set_color normal


    # Line 2
    # echo
    # if test $VIRTUAL_ENV
    #     printf "(%s) " (set_color blue)(basename $VIRTUAL_ENV)(set_color normal)
    # end
    # printf '↪  '
    # set_color normal
    # echo
end
