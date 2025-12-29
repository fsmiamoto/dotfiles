#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

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

const ICONS = {
  folder: '',
  gitBranch: '',
  model: '',
  usage: ''
};

const THEME = {
  frame: COLORS.blue,
  text: COLORS.fg,
  dim: COLORS.comment,
  user: COLORS.cyan,
  host: COLORS.purple,
  dir: COLORS.green,
  dirIcon: COLORS.teal,
  branch: COLORS.orange,
  model: COLORS.magenta
};

function paint(text, ...colors) {
  return `${colors.join('')}${text}`;
}

function makeSegment(content, { frameColor = THEME.frame, bold = true } = {}) {
  if (!content) {
    return '';
  }

  const weight = bold ? COLORS.bold : '';
  return `${weight}${frameColor}[${content}${frameColor}]${COLORS.reset}`;
}

function renderSegments(segments) {
  return segments.filter(Boolean).join(' ');
}

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

function getGitBranch(cwd) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString().trim();

    if (!branch || branch === 'HEAD') {
      return null;
    }

    return branch;
  } catch (error) {
    return null;
  }
}

function getUserHostSegment({ username, hostname, currentDir }) {
  const content = [
    paint(username, THEME.user),
    paint('@', THEME.dim),
    paint(hostname, THEME.host),
    paint(` ${ICONS.folder} `, THEME.dirIcon),
    paint(currentDir, THEME.dir)
  ].join('');

  return makeSegment(content);
}

function getBranchSegment(branch) {
  if (!branch) {
    return '';
  }

  return makeSegment(paint(`${ICONS.gitBranch} ${branch}`, THEME.branch));
}

function getModelSegment(modelName) {
  return makeSegment(paint(`${ICONS.model} ${modelName}`, THEME.text, THEME.model));
}

function getUsageSegment(tokenUsage) {
  if (tokenUsage === null) {
    return '';
  }

  const percentage = ((tokenUsage / CONTEXT_LIMIT) * 100).toFixed(1);
  const color = getColorForPercentage(parseFloat(percentage));
  return makeSegment(paint(`${ICONS.usage} ${percentage}%`, THEME.text, color));
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
        const workspaceDir = input.workspace?.current_dir || process.cwd();
        const currentDir = path.basename(workspaceDir);
        const modelName = formatModelName(input.model?.id || 'unknown');
        const gitBranch = getGitBranch(workspaceDir);
        const transcriptPath = input.transcript_path;
        const tokenUsage = transcriptPath ? parseTranscriptForTokens(transcriptPath) : null;

        const statusLine = renderSegments([
          getUserHostSegment({ username, hostname, currentDir }),
          getBranchSegment(gitBranch),
          getModelSegment(modelName),
          getUsageSegment(tokenUsage)
        ]);

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
