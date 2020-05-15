let g:tmuxline_preset = {
            \'a'    : '#S',
            \'win' : '#I #W',
            \'cwin'  : ['#I', '#W #F #{?window_zoomed_flag,,}'],
            \'x'    : '#(jp-date a)',
            \'y'    : '%m月%d日',
            \'z'    : '%R',
            \'options' :{'status-justify': 'left'}}
