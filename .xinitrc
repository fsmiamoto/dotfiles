# Source Xprofile
[ -f ~/.xprofile ] && source ~/.xprofile

# Merge Xresources
[ -f "$HOME/.Xresources" ] && xrdb -merge "$HOME/.Xresources"

# Merge Xmodmap
[ -f "$HOME/.Xmodmap" ] && xmodmap "$HOME/.Xmodmap"

# Set monitor layout
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

# DWM Status
dwmblocks &

# Initiate WM
while :; do
	ssh-agent dbus-launch dwm
done
