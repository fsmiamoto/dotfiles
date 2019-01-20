#!/bin/bash

# Kill all previous instances of polybar
killall -q polybar

# Wait until polybar is killed
while pgrep -u $UID -x polybar >/dev/null; do sleep 1; done

# Launch polybar
polybar monitor0 -r &
polybar monitor1 -r &
