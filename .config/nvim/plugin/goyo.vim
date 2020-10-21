function! s:goyo_enter()
    set noshowmode
    set noshowcmd
    set scrolloff=999
    set spell
    set list!
    CocDisable
    set textwidth=80
    let b:quitting = 0
    let b:quitting_bang = 0
    autocmd QuitPre <buffer> let b:quitting = 1
    cabbrev <buffer> q! let b:quitting_bang = 1 <bar> q!
endfunction

function! s:goyo_leave()
    set showmode
    set showcmd
    set scrolloff=3
    set list!
    CocEnable
    set textwidth=0
    " Quit Vim if this is the only remaining buffer
    if b:quitting && len(filter(range(1, bufnr('$')), 'buflisted(v:val)')) == 1
        if b:quitting_bang
            qa!
        else
            qa
        endif
    endif
endfunction

autocmd! User GoyoEnter nested call <SID>goyo_enter()
autocmd! User GoyoLeave nested call <SID>goyo_leave()
