#!/usr/bin/env python3
"""
Update sketchybar and Ghostty colors based on current wallpaper using wallust.

Usage:
    python3 update_colors.py

Dependencies:
    - wallust (must be installed and in PATH)
    - osascript (macOS built-in)
"""

import colorsys
import json
import subprocess
import sys
from pathlib import Path


def get_current_wallpaper() -> str:
    """Get the current desktop wallpaper path using osascript."""
    result = subprocess.run(
        [
            "osascript",
            "-e",
            'tell application "System Events" to get picture of current desktop',
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to get wallpaper: {result.stderr}")
    return result.stdout.strip()


def get_wallust_palette(wallpaper_path: str) -> dict:
    """Extract color palette from wallpaper using wallust."""
    result = subprocess.run(
        ["wallust", "run", wallpaper_path, "-s"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to run wallust: {result.stderr}")
    # Read the generated JSON template
    colors_file = Path.home() / ".cache" / "colors.json"
    return json.loads(colors_file.read_text())


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert #RRGGBB to (r, g, b) tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def rgb_to_hsl(r: int, g: int, b: int) -> tuple[float, float, float]:
    """Convert RGB (0-255) to HSL (h: 0-360, s: 0-1, l: 0-1)."""
    r_norm, g_norm, b_norm = r / 255.0, g / 255.0, b / 255.0
    h, l, s = colorsys.rgb_to_hls(r_norm, g_norm, b_norm)
    return h * 360, s, l


def classify_color_by_hue(hex_color: str) -> str:
    """
    Classify a color by its hue into semantic color names.

    Returns one of: red, orange, yellow, green, blue, magenta, grey
    """
    r, g, b = hex_to_rgb(hex_color)
    h, s, l = rgb_to_hsl(r, g, b)

    # Low saturation colors are grey/white/black based on lightness
    if s < 0.15:
        return "grey"

    # Classify by hue range
    if h < 15 or h >= 345:
        return "red"
    elif h < 45:
        return "orange"
    elif h < 70:
        return "yellow"
    elif h < 165:
        return "green"
    elif h < 260:
        return "blue"
    elif h < 290:
        return "magenta"
    else:  # 290-345
        return "magenta"  # Pink range maps to magenta


def hex_to_sketchybar(hex_color: str) -> str:
    """Convert #RRGGBB to 0xffRRGGBB format."""
    return f"0xff{hex_color.lstrip('#')}"


def find_best_colors(palette: dict) -> dict:
    """
    Analyze wallust palette and find the best color for each semantic name.

    Returns a dict mapping semantic names to hex colors.
    """
    # Group colors by their semantic classification
    classified = {
        "red": [],
        "orange": [],
        "yellow": [],
        "green": [],
        "blue": [],
        "magenta": [],
        "grey": [],
    }

    # Analyze colors 1-6 (the main accent colors)
    for i in range(1, 7):
        color_key = f"color{i}"
        if color_key in palette:
            hex_color = palette[color_key]
            semantic = classify_color_by_hue(hex_color)
            r, g, b = hex_to_rgb(hex_color)
            _, s, l = rgb_to_hsl(r, g, b)
            # Store color with its saturation for picking the most vibrant
            classified[semantic].append((hex_color, s, l))

    # Pick the most saturated color for each semantic name
    result = {}
    for semantic, candidates in classified.items():
        if candidates:
            # Sort by saturation (descending) and pick the most vibrant
            candidates.sort(key=lambda x: x[1], reverse=True)
            result[semantic] = candidates[0][0]

    return result


def generate_colors_lua(palette: dict) -> str:
    """Generate the colors.lua content from wallust palette."""
    # Get base colors (flat structure)
    background = palette.get("background", "#1a1b26")
    foreground = palette.get("foreground", "#bdc7f0")

    # Find best semantic colors from palette
    semantic_colors = find_best_colors(palette)

    # Defaults if not found in palette
    defaults = {
        "red": "#f7768e",
        "orange": "#ff9e64",
        "yellow": "#e0af68",
        "green": "#9ece6a",
        "blue": "#3d59a1",
        "magenta": "#bb9af7",
        "grey": "#959cbd",
    }

    # Merge with defaults
    for key, default in defaults.items():
        if key not in semantic_colors:
            semantic_colors[key] = default

    # Calculate background variants
    # bg1: slightly lighter than background
    # bg2: even lighter
    bg_r, bg_g, bg_b = hex_to_rgb(background)

    def lighten(r, g, b, amount):
        return (
            min(255, int(r + (255 - r) * amount)),
            min(255, int(g + (255 - g) * amount)),
            min(255, int(b + (255 - b) * amount)),
        )

    def darken(r, g, b, amount):
        return (
            max(0, int(r * (1 - amount))),
            max(0, int(g * (1 - amount))),
            max(0, int(b * (1 - amount))),
        )

    bg1_rgb = lighten(bg_r, bg_g, bg_b, 0.05)
    bg2_rgb = lighten(bg_r, bg_g, bg_b, 0.10)
    popup_bg_rgb = lighten(bg_r, bg_g, bg_b, 0.08)

    bg1 = f"#{bg1_rgb[0]:02x}{bg1_rgb[1]:02x}{bg1_rgb[2]:02x}"
    bg2 = f"#{bg2_rgb[0]:02x}{bg2_rgb[1]:02x}{bg2_rgb[2]:02x}"
    popup_bg = f"#{popup_bg_rgb[0]:02x}{popup_bg_rgb[1]:02x}{popup_bg_rgb[2]:02x}"

    # Generate lua content
    lua_content = f"""return {{
\tblack = {hex_to_sketchybar(background)},
\twhite = {hex_to_sketchybar(foreground)},
\tred = {hex_to_sketchybar(semantic_colors["red"])},
\tgreen = {hex_to_sketchybar(semantic_colors["green"])},
\tblue = {hex_to_sketchybar(semantic_colors["blue"])},
\tyellow = {hex_to_sketchybar(semantic_colors["yellow"])},
\torange = {hex_to_sketchybar(semantic_colors["orange"])},
\tmagenta = {hex_to_sketchybar(semantic_colors["magenta"])},
\tgrey = {hex_to_sketchybar(semantic_colors["grey"])},
\ttransparent = 0x00000000,
\tbar = {{
\t\tbg = {hex_to_sketchybar(background)},
\t\tborder = {hex_to_sketchybar(semantic_colors["blue"])},
\t}},
\tpopup = {{
\t\tbg = {hex_to_sketchybar(popup_bg)},
\t\tborder = {hex_to_sketchybar(semantic_colors["blue"])},
\t}},
\tbg2 = {hex_to_sketchybar(bg2)},
\tbg1 = {hex_to_sketchybar(bg1)},

\twith_alpha = function(color, alpha)
\t\tif alpha > 1.0 or alpha < 0.0 then
\t\t\treturn color
\t\tend
\t\treturn (color & 0x00ffffff) | (math.floor(alpha * 255.0) << 24)
\tend,
}}
"""
    return lua_content


def generate_tmux_colors(palette: dict) -> str:
    """Generate tmux colors configuration from wallust palette."""
    # Get base colors
    background = palette.get("background", "#1a1b26")
    foreground = palette.get("foreground", "#c0caf5")

    # Find best semantic colors from palette
    semantic_colors = find_best_colors(palette)
    blue = semantic_colors.get("blue", "#7aa2f7")

    # Calculate background variants
    bg_r, bg_g, bg_b = hex_to_rgb(background)

    def lighten(r, g, b, amount):
        return (
            min(255, int(r + (255 - r) * amount)),
            min(255, int(g + (255 - g) * amount)),
            min(255, int(b + (255 - b) * amount)),
        )

    def darken(r, g, b, amount):
        return (
            max(0, int(r * (1 - amount))),
            max(0, int(g * (1 - amount))),
            max(0, int(b * (1 - amount))),
        )

    bg1_rgb = lighten(bg_r, bg_g, bg_b, 0.05)
    bg_dark_rgb = darken(bg_r, bg_g, bg_b, 0.10)

    bg1 = f"#{bg1_rgb[0]:02x}{bg1_rgb[1]:02x}{bg1_rgb[2]:02x}"
    bg_dark = f"#{bg_dark_rgb[0]:02x}{bg_dark_rgb[1]:02x}{bg_dark_rgb[2]:02x}"

    # Generate tmux configuration
    tmux_content = f"""# Wallust theme - auto-generated from wallpaper colors
# This file is managed by update_colors.py

# Mode and message styles
set -g mode-style "fg={blue},bg={bg1}"
set -g message-style "fg={blue},bg={bg1}"
set -g message-command-style "fg={blue},bg={bg1}"

# Pane borders
set -g pane-border-style "fg={bg1}"
set -g pane-active-border-style "fg={blue}"

# Status bar
set -g status "on"
set -g status-justify "left"
set -g status-style "fg={blue},bg={background}"
set -g status-left-length "100"
set -g status-right-length "100"
set -g status-left-style NONE
set -g status-right-style NONE

# Status bar content
set -g status-left "#[fg={bg_dark},bg={blue},bold] #S #[fg={blue},bg={background},nobold,nounderscore,noitalics]\ue0b0"
set -g status-right "#[fg={background},bg={background},nobold,nounderscore,noitalics]\ue0b2#[fg={blue},bg={background}] #{{prefix_highlight}} #[fg={bg1},bg={background},nobold,nounderscore,noitalics]\ue0b2#[fg={blue},bg={bg1}] #(tmux-weather) \ue0b3 %m月%d日 (%a) \ue0b3 %H:%M #[fg={blue},bg={bg1},nobold,nounderscore,noitalics]\ue0b2#[fg={bg_dark},bg={blue},bold] #h "

# Window status
setw -g window-status-activity-style "underscore,fg={foreground},bg={background}"
setw -g window-status-separator ""
setw -g window-status-style "NONE,fg={foreground},bg={background}"
setw -g window-status-format "#[fg={background},bg={background},nobold,nounderscore,noitalics]\ue0b0#[default] #I \ue0b1 #W #F #[fg={background},bg={background},nobold,nounderscore,noitalics]\ue0b0"
setw -g window-status-current-format "#[fg={background},bg={bg1},nobold,nounderscore,noitalics]\ue0b0#[fg={blue},bg={bg1},bold] #I \ue0b1 #W #F #[fg={bg1},bg={background},nobold,nounderscore,noitalics]\ue0b0"
"""
    return tmux_content


def generate_ghostty_theme(palette: dict) -> str:
    """Generate the Ghostty theme content from wallust palette."""
    # Get base colors (flat structure)
    background = palette.get("background", "#1a1b26")
    foreground = palette.get("foreground", "#c0caf5")

    # Calculate selection background (lighter than background)
    bg_r, bg_g, bg_b = hex_to_rgb(background)
    sel_bg = (
        min(255, int(bg_r + (255 - bg_r) * 0.15)),
        min(255, int(bg_g + (255 - bg_g) * 0.15)),
        min(255, int(bg_b + (255 - bg_b) * 0.15)),
    )
    selection_bg = f"#{sel_bg[0]:02x}{sel_bg[1]:02x}{sel_bg[2]:02x}"

    # Build palette lines (0-15)
    palette_lines = []
    for i in range(16):
        color_key = f"color{i}"
        color = palette.get(color_key, "#000000")
        palette_lines.append(f"palette = {i}={color}")

    theme_content = f"""# Wallust theme - auto-generated from wallpaper colors
# This file is managed by update_colors.py

{chr(10).join(palette_lines)}

background = {background}
foreground = {foreground}
cursor-color = {foreground}
selection-background = {selection_bg}
selection-foreground = {foreground}
"""
    return theme_content


def reload_sketchybar():
    """Reload sketchybar to apply new colors."""
    subprocess.run(["sketchybar", "--reload"], check=True)


def reload_tmux():
    """Reload tmux configuration for all running sessions."""
    # Check if tmux is running
    result = subprocess.run(
        ["tmux", "list-sessions"], capture_output=True, text=True
    )
    if result.returncode == 0:
        # Reload config for all sessions
        subprocess.run(
            ["tmux", "source-file", str(Path.home() / ".tmux.conf")], check=True
        )


def main():
    # Get script directory to find colors.lua relative path
    script_dir = Path(__file__).parent
    colors_lua_path = script_dir.parent / "colors.lua"

    # Ghostty theme path (in ~/.config/ghostty/)
    ghostty_theme_path = Path.home() / ".config" / "ghostty" / "themes" / "wallust"

    # tmux colors path (in ~/.tmux/)
    tmux_colors_path = Path.home() / ".tmux" / "colors.conf"

    print("Getting current wallpaper...")
    wallpaper = get_current_wallpaper()
    print(f"Wallpaper: {wallpaper}")

    print("Extracting color palette with wallust...")
    palette = get_wallust_palette(wallpaper)

    # Update sketchybar colors
    print("Generating colors.lua...")
    lua_content = generate_colors_lua(palette)

    print(f"Writing to {colors_lua_path}...")
    colors_lua_path.write_text(lua_content)

    # Update Ghostty theme
    print("Generating Ghostty theme...")
    ghostty_content = generate_ghostty_theme(palette)

    print(f"Writing to {ghostty_theme_path}...")
    ghostty_theme_path.write_text(ghostty_content)

    # Update tmux colors
    print("Generating tmux colors...")
    tmux_content = generate_tmux_colors(palette)

    print(f"Writing to {tmux_colors_path}...")
    tmux_colors_path.parent.mkdir(parents=True, exist_ok=True)
    tmux_colors_path.write_text(tmux_content)

    print("Reloading sketchybar...")
    reload_sketchybar()

    print("Reloading tmux...")
    reload_tmux()

    print("Done! Sketchybar, Ghostty, and tmux colors updated based on wallpaper.")
    print(
        "Note: Set 'theme = wallust' in Ghostty config and restart to see terminal color changes."
    )
    print("tmux sessions have been reloaded automatically.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
