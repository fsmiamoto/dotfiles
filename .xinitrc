# Source Xprofile
[ -f ~/.xprofile ] && source ~/.xprofile

# Merge Xresources
[ -f "$HOME/.Xresources" ] && xrdb -merge "$HOME/.Xresources"

# Merge Xmodmap
[ -f "$HOME/.Xmodmap" ] && xmodmap "$HOME/.Xmodmap"

# Map Caps to Esc
setxkbmap -option caps:escape -layout us

# Set monitor layout
mons -e right

# Restore PyWal settings
wal -R

# Network Manager Applet
nm-applet & 

# Compton for transparency
compton -b &

# SCIM for input
scim -d &

# Transmisssion 
transmission-daemon &

# Initiate i3
exec dbus-launch i3


