# Source Xprofile
[ -f ~/.xprofile ] && source ~/.xprofile

# Merge Xresources
[ -f "$HOME/.Xresources" ] && xrdb -merge "$HOME/.Xresources"

# Merge Xmodmap
[ -f "$HOME/.Xmodmap" ] && xmodmap "$HOME/.Xmodmap"

# Map Caps to Esc
setxkbmap -option caps:escape

# Set monitor layout
# mons -e right
[ -f "$HOME/.screenlayout/main.sh" ] && source ~/.screenlayout/main.sh

# Restore PyWal settings
wal -R

# Network Manager Applet
nm-applet &

# Compton for transparency
compton -b &

# Transmisssion
transmission-daemon &

# Redshift
redshift &

# Unclutter for hiding cursor when idle
unclutter &

# Start MPD
mpd &

# Initiate i3
exec dbus-launch i3


