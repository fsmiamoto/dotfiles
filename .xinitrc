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

# Redshift
redshift &

# Unclutter for hiding cursor when idle
unclutter &

# DWM Status
dwmblocks &

# Increase repeat keystroke rate
xset r rate 300 60 &

opensnitch-ui &

# Fix misbehaving Java apps
export _JAVA_AWT_WM_NONREPARENTING=1

sudo mount -t cifs -o credentials=/etc/samba/credentials/share,nodfs,iocharset=utf8,noperm //nas/shigueo /home/shigueo/nas

# Initiate WM
while :; do
	ssh-agent dbus-launch dwm
done
