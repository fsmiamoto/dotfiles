# tmux Special Key Names

Use these with `tty-test.sh send`. They are case-sensitive.

## Common Keys

| Key            | tmux name |
|----------------|-----------|
| Enter/Return   | `Enter`   |
| Escape         | `Escape`  |
| Tab            | `Tab`     |
| Backspace      | `BSpace`  |
| Space          | `Space`   |
| Up arrow       | `Up`      |
| Down arrow     | `Down`    |
| Left arrow     | `Left`    |
| Right arrow    | `Right`   |
| Home           | `Home`    |
| End            | `End`     |
| Page Up        | `PPage`   |
| Page Down      | `NPage`   |
| Delete         | `DC`      |

## Function Keys

`F1` through `F12`

## Modifier Combos

| Modifier | Prefix | Example              |
|----------|--------|----------------------|
| Ctrl     | `C-`   | `C-c` `C-d` `C-z`   |
| Alt/Meta | `M-`   | `M-a` `M-x`         |
| Shift    | `S-`   | `S-Up` `S-Down`     |

## Usage Examples

```bash
# Type text and press Enter
tty-test.sh send myapp "hello" Enter

# Ctrl+C to interrupt
tty-test.sh send myapp C-c

# Navigate a menu
tty-test.sh send myapp Down Down Enter

# Type the literal word "Enter" (not the key)
tty-test.sh send myapp -l "Enter"
```

## Key Points

- Without `-l`, tmux interprets key names: `send Enter` = press Enter key
- With `-l`, tmux types literally: `send -l Enter` = type the letters E-n-t-e-r
- Multiple keys in one call: `send "hello" Enter` types "hello" then presses Enter
- For sequences needing timing, use separate `send` + `wait` pairs
