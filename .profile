export QT_QPA_PLATFORMTHEME="qt5ct"
export GTK2_RC_FILES="$HOME/.gtkrc-2.0"

# Set SCIM as Input Method
export XMODIFIERS=@im=SCIM 
export GTK_IM_MODULE="scim" 
export QT_IM_MODULE="scim" 

# Enviroment variables
export TERMINAL=st
export EDITOR=nvim
export BROWSER=firefox
export FILE=ranger
export ANDROID_HOME="${HOME}/Android/Sdk" 
export PATH="$PATH:${HOME}/.local/bin/:${HOME}/.scripts/:${HOME}/.cargo/bin"

