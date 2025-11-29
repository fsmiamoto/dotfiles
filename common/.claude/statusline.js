#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONTEXT_LIMIT = 200000;
const GREEN_THRESHOLD = 70;
const YELLOW_THRESHOLD = 90;

// Tokyo Night theme colors (using 256-color ANSI codes)
const COLORS = {
  reset: '\x1b[0m',
  // Tokyo Night palette
  blue: '\x1b[38;5;111m',      // #7aa2f7 - bright blue
  cyan: '\x1b[38;5;117m',      // #7dcfff - cyan
  green: '\x1b[38;5;158m',     // #9ece6a - green
  yellow: '\x1b[38;5;221m',    // #e0af68 - yellow
  orange: '\x1b[38;5;215m',    // #ff9e64 - orange
  red: '\x1b[38;5;203m',       // #f7768e - red
  purple: '\x1b[38;5;183m',    // #bb9af7 - purple
  magenta: '\x1b[38;5;212m',   // #ff007c - magenta
  teal: '\x1b[38;5;116m',      // #2ac3de - teal
  fg: '\x1b[38;5;189m',        // #c0caf5 - foreground
  comment: '\x1b[38;5;102m',   // #565f89 - comment gray
  bold: '\x1b[1m'
};

function getColorForPercentage(percentage) {
  if (percentage < GREEN_THRESHOLD) return COLORS.teal;
  if (percentage < YELLOW_THRESHOLD) return COLORS.orange;
  return COLORS.red;
}

function parseTranscriptForTokens(transcriptPath) {
  try {
    if (!fs.existsSync(transcriptPath)) {
      return null;
    }

    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.trim().split('\n');

    // Read from the end to find the most recent assistant message with usage data
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const line = JSON.parse(lines[i]);

        // Look for assistant messages with usage data
        if (line.type === 'assistant' && line.message?.usage) {
          const usage = line.message.usage;
          const totalTokens =
            (usage.input_tokens || 0) +
            (usage.output_tokens || 0) +
            (usage.cache_creation_input_tokens || 0) +
            (usage.cache_read_input_tokens || 0);

          return totalTokens;
        }
      } catch (e) {
        // Skip malformed lines
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

function formatModelName(modelId) {
  return modelId
    .replace(/^claude-/, '')
    .replace(/-20[0-9]{6}$/, '');
}

function main() {
  try {
    // Read JSON from stdin
    const chunks = [];
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => {
      try {
        const input = JSON.parse(Buffer.concat(chunks).toString());

        const username = os.userInfo().username;
        const hostname = os.hostname().split('.')[0];
        const currentDir = path.basename(input.workspace?.current_dir || process.cwd());
        const modelName = formatModelName(input.model?.id || 'unknown');

        // Try to get token usage from transcript
        const transcriptPath = input.transcript_path;
        const tokenUsage = transcriptPath ? parseTranscriptForTokens(transcriptPath) : null;

        // Build colorful statusline with Tokyo Night theme
        let statusLine = `${COLORS.bold}${COLORS.blue}[${COLORS.cyan}${username}${COLORS.comment}@${COLORS.purple}${hostname} ${COLORS.green}${currentDir}${COLORS.blue}]${COLORS.reset}`;
        statusLine += ` ${COLORS.bold}${COLORS.blue}[${COLORS.fg}model: ${COLORS.magenta}${modelName}${COLORS.blue}]${COLORS.reset}`;

        if (tokenUsage !== null) {
          const percentage = ((tokenUsage / CONTEXT_LIMIT) * 100).toFixed(1);
          const color = getColorForPercentage(parseFloat(percentage));
          statusLine += ` ${COLORS.bold}${COLORS.blue}[${COLORS.fg}ctx: ${color}${percentage}%${COLORS.blue}]${COLORS.reset}`;
        }

        process.stdout.write(statusLine);
      } catch (error) {
        // Fallback to basic statusline if parsing fails
        const username = os.userInfo().username;
        const hostname = os.hostname().split('.')[0];
        const currentDir = path.basename(process.cwd());
        process.stdout.write(`[${username}@${hostname} ${currentDir}]`);
      }
    });
  } catch (error) {
    process.stdout.write('[statusline error]');
  }
}

main();
