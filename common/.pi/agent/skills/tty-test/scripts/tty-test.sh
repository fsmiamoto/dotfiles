#!/usr/bin/env bash
set -euo pipefail

PREFIX="tty-test"

usage() {
  cat <<'EOF'
Usage: tty-test.sh <command> [args...]

Commands:
  start   <name> <cmd> [--cols N] [--rows N]   Start program in tmux session
  send    <name> <keys...>                     Send keys to session
  capture <name> [--history]                   Capture pane content
  wait    <name> <pattern> [--timeout N]       Wait for pattern in output (grep -E)
  kill    <name>                               Kill session
  list                                         List active tty-test sessions
EOF
}

session_name() {
  echo "${PREFIX}-${1}"
}

cmd_start() {
  if [[ $# -lt 2 ]]; then
    echo "Usage: tty-test.sh start <name> <cmd> [--cols N] [--rows N]" >&2
    exit 1
  fi
  local name="$1" cmd="$2" cols=80 rows=24
  shift 2
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cols) cols="$2"; shift 2 ;;
      --rows) rows="$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done
  local session
  session="$(session_name "$name")"
  # Kill existing session with same name if any
  tmux kill-session -t "$session" 2>/dev/null || true
  tmux new-session -d -s "$session" -x "$cols" -y "$rows" "$cmd"
  # Keep pane alive after program exits so capture still works
  tmux set-option -t "$session" remain-on-exit on
  echo "Started session: $session (${cols}x${rows})"
}

cmd_send() {
  if [[ $# -lt 2 ]]; then
    echo "Usage: tty-test.sh send <name> <keys...>" >&2
    exit 1
  fi
  local session
  session="$(session_name "$1")"
  shift
  tmux send-keys -t "$session" "$@"
}

cmd_capture() {
  if [[ $# -lt 1 ]]; then
    echo "Usage: tty-test.sh capture <name> [--history]" >&2
    exit 1
  fi
  local session history=false
  session="$(session_name "$1")"
  shift
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --history) history=true; shift ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done
  local output
  if $history; then
    output="$(tmux capture-pane -t "$session" -p -S -)"
  else
    output="$(tmux capture-pane -t "$session" -p)"
  fi
  # Strip tmux "Pane is dead" status line and trailing blank lines
  echo "$output" | grep -v '^Pane is dead' | sed -e :a -e '/^[[:space:]]*$/{ $d; N; ba; }'
}

cmd_wait() {
  if [[ $# -lt 2 ]]; then
    echo "Usage: tty-test.sh wait <name> <pattern> [--timeout N]" >&2
    exit 1
  fi
  local name="$1" pattern="$2"
  shift 2
  local timeout=10
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --timeout) timeout="$2"; shift 2 ;;
      *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
  done
  local session
  session="$(session_name "$name")"
  local deadline=$(( SECONDS + timeout ))
  while (( SECONDS < deadline )); do
    local output
    output="$(tmux capture-pane -t "$session" -p 2>/dev/null || echo "")"
    if echo "$output" | grep -qE "$pattern"; then
      echo "$output"
      return 0
    fi
    sleep 0.2
  done
  # One last try
  local output
  output="$(tmux capture-pane -t "$session" -p 2>/dev/null || echo "")"
  if echo "$output" | grep -qE "$pattern"; then
    echo "$output"
    return 0
  fi
  echo "TIMEOUT after ${timeout}s waiting for: $pattern" >&2
  echo "--- last captured output ---" >&2
  echo "$output" >&2
  return 1
}

cmd_kill() {
  if [[ $# -lt 1 ]]; then
    echo "Usage: tty-test.sh kill <name>" >&2
    exit 1
  fi
  local session
  session="$(session_name "$1")"
  tmux kill-session -t "$session" 2>/dev/null || true
  echo "Killed session: $session"
}

cmd_list() {
  tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "^${PREFIX}-" || echo "No active tty-test sessions"
}

# --- Main ---
if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

command="$1"
shift

case "$command" in
  start)   cmd_start "$@" ;;
  send)    cmd_send "$@" ;;
  capture) cmd_capture "$@" ;;
  wait)    cmd_wait "$@" ;;
  kill)    cmd_kill "$@" ;;
  list)    cmd_list "$@" ;;
  -h|--help) usage ;;
  *)       echo "Unknown command: $command" >&2; usage; exit 1 ;;
esac
