local ret_status="%(?:%{$fg_bold[green]%}:%{$fg_bold[red]%})"
PROMPT='${ret_status}%c %{$reset_color%}$(git_prompt_info)
$:%{$reset_color%} '

ZSH_THEME_GIT_PROMPT_PREFIX="%{$fg_bold[blue]%}(%{$fg[red]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$fg_bold[blue]%})%{$fg_bold[yellow]%}"
ZSH_THEME_GIT_PROMPT_DIRTY="%{$fg_bold[green]%}*"

