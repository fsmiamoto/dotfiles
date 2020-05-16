let g:tmuxline_preset = {
            \'a'    : '#S',
            \'win' : '#I #W',
            \'cwin'  : ['#I', '#{?window_zoomed_flag,,}'],
            \'x'    : '#(jp-date a)',
            \'y'    : '%m月%d日',
            \'z'    : '%R',
            \'options' :{'status-justify': 'left'}}
