local ret_status="%(?: : !)"

PROMPT='%{$fg_bold[green]%}%c %{$reset_color%}$(git_prompt_info)${ret_status}
$:%{$reset_color%} '

ZSH_THEME_GIT_PROMPT_PREFIX="%{$fg_bold[blue]%}(%{$fg[red]%}"
ZSH_THEME_GIT_PROMPT_SUFFIX="%{$fg_bold[blue]%})%{$fg_bold[yellow]%}"
ZSH_THEME_GIT_PROMPT_DIRTY="%{$fg_bold[green]%}*"

