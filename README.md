# tmux-claude-live

Real-time monitoring of Claude Code usage through tmux variables.

## Overview

**tmux-claude-live** is a tool that leverages [ccusage](https://github.com/ryoppippi/ccusage) to provide real-time Claude Code usage monitoring through tmux variables. It offers complete customization freedom for users to display the information as they prefer.

### Key Features

- **Real-time monitoring**: Track token usage, burn rate, and costs in real-time
- **5-hour block tracking**: Monitor Claude Code billing blocks
- **Session time tracking**: Display remaining session time
- **Smart color coding**: Visual warnings based on usage levels
- **High customization**: Complete freedom using tmux variables
- **tmux native**: Fully integrated with tmux variable system
- **Process safety**: Lock management prevents daemon conflicts
- **Auto-recovery**: Exponential backoff retry with structured error handling
- **🛡️ Reliability Watchdog**: Prevents stale data display with automatic data validation
- **🔍 Health monitoring**: Continuous daemon monitoring with auto-restart
- **🎯 Zero-Maintenance**: Always displays current data, no manual intervention required

## Installation

### Prerequisites

- [Bun](https://bun.sh/) runtime
- [ccusage](https://github.com/ryoppippi/ccusage) command-line tool
- tmux

### Setup

1. **Install dependencies**:
```bash
# Install ccusage
npm install -g ccusage

# Install mise (Node.js/Bun management tool)
curl https://mise.run | sh
```

2. **Get the project and build**:
```bash
git clone <repository-url>
cd tmux-claude-live
mise install
bun install
bun run build
```

3. **Add to tmux configuration**:
```bash
# Add to ~/.tmux.conf
run-shell '/path/to/tmux-claude-live/claude-live.tmux'

# Reload tmux configuration
tmux source-file ~/.tmux.conf
```

## Usage

### Basic Usage

#### ⚠️ Important: Setting Token Limits

For accurate usage calculations and warning displays, set your token limit:

```bash
# ~/.tmux.conf
set -g @ccusage_token_limit "140000"  # Claude Pro: 140k tokens per 5 hours
# set -g @ccusage_token_limit "300000"  # Claude Pro Max: 300k tokens per 5 hours
```

#### Display Configuration

The plugin automatically sets tmux variables that you can freely customize:

```bash
# Basic display
set -g status-right "#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} | #{@ccusage_time_remaining} | %H:%M"

# Colored display
set -g status-right "#[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default] | #{@ccusage_time_remaining} | %H:%M"
```

### Available Variables

#### Basic Information
- `@ccusage_is_active` - Whether block is active (`true`/`false`)
- `@ccusage_total_tokens` - Total token count (`20086`)
- `@ccusage_total_tokens_formatted` - Formatted token count (`20.1k`)
- `@ccusage_cost_current` - Current cost (`$20.98`)

#### Time Information
- `@ccusage_time_remaining` - Remaining time (`3h11m`)
- `@ccusage_session_time_remaining` - Session remaining time (`3h6m`)
- `@ccusage_remaining_seconds` - Remaining time in seconds
- `@ccusage_session_remaining_seconds` - Session remaining time in seconds

#### Usage Information
- `@ccusage_usage_percent` - Usage percentage (`14.35%`)
- `@ccusage_tokens_remaining` - Remaining token count
- `@ccusage_tokens_remaining_formatted` - Formatted remaining tokens (`119.9k`)
- `@ccusage_token_limit` - Token limit
- `@ccusage_token_limit_formatted` - Formatted limit (`140k`)

#### Health Status (New!)
- `@ccusage_daemon_health` - Overall health status (`healthy`/`degraded`/`unhealthy`)
- `@ccusage_daemon_health_is_healthy` - Boolean health indicator (`true`/`false`)
- `@ccusage_daemon_uptime` - Daemon uptime (`2h15m`)
- `@ccusage_daemon_uptime_hours` - Uptime in hours (`2.3`)
- `@ccusage_error_rate` - Error rate percentage (`1.2%`)
- `@ccusage_memory_usage` - Memory usage (`32.4MB`)
- `@ccusage_last_self_heal` - Last self-healing time (`2025-07-25 14:30:45` or `Never`)
- `@ccusage_health_issues` - Current health issues summary (`None` or issue description)

#### 🛡️ Reliability Watchdog Variables (Enhanced Daemon)
- `@ccusage_enhanced_system` - Enhanced system status (`active`/`stopped`/`error`)
- `@ccusage_daemon_status` - Reliability daemon status (`running`/`stopped`/`healthy`)
- `@ccusage_data_freshness` - Data freshness level (`fresh`/`stale`/`expired`)
- `@ccusage_data_age_seconds` - Data age in seconds
- `@ccusage_last_update` - Last update timestamp (unix timestamp)

#### Burn Rate Information
- `@ccusage_burn_rate` - Token burn rate (raw value)
- `@ccusage_burn_rate_formatted` - Formatted burn rate (`184/min`)
- `@ccusage_cost_per_hour` - Cost per hour

#### Warning & Color Information
- `@ccusage_warning_level` - Warning level (`normal`/`warning`/`danger`)
- `@ccusage_warning_color` - Warning color (`colour2`/`colour3`/`colour1`)
- `@ccusage_warning_color_name` - Warning color name (`green`/`yellow`/`red`)

**Warning Level Determination**:
- `normal` (green): ccusage status `"ok"` - Under 70% of limit
- `warning` (yellow): ccusage status `"warning"` - 70-90% of limit
- `danger` (red): ccusage status `"exceeds"` - Over 90% of limit or exceeded

### Customization Examples

#### Simple Version
```bash
set -g status-right "⏱ #{@ccusage_time_remaining} | 🎯 #{@ccusage_tokens_remaining_formatted} (#{@ccusage_usage_percent})"
```

#### Detailed Version
```bash
set -g status-right "#[fg=#{@ccusage_warning_color}]Claude: #{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} (#{@ccusage_usage_percent}) | #{@ccusage_burn_rate_formatted} | ⏱ #{@ccusage_time_remaining} | #{@ccusage_cost_current}#[default]"
```

#### With Session Time
```bash
set -g status-right "#[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default] | T:#{@ccusage_time_remaining} S:#{@ccusage_session_time_remaining} | %H:%M"
set -g status-right-length 150
```

#### With Health Monitoring
```bash
# Simple health indicator
set -g status-right "#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} | ⚡#{@ccusage_daemon_health} | %H:%M"

# Detailed health status
set -g status-right "#[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default] | 💚#{@ccusage_daemon_health} #{@ccusage_daemon_uptime} | %H:%M"
```

#### Multiple Locations
```bash
set -g status-left "#[fg=#{@ccusage_warning_color}]●#[default] #{session_name}"
set -g status-right "#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} | #{@ccusage_time_remaining} | %H:%M"
```

## Configuration Options

### tmux Variable Settings

```bash
# Update interval (seconds, default: 5)
set -g @ccusage_update_interval 10

# Token limit (used with ccusage --token-limit option, default: null)
set -g @ccusage_token_limit 100000

# Display formats
set -g @ccusage_time_format "compact"     # compact/verbose/short
set -g @ccusage_cost_format "currency"    # currency/number/compact
set -g @ccusage_token_format "compact"    # compact/full/short

# Auto start (default: true)
set -g @ccusage_auto_start "false"
```

### Color Settings

```bash
# Custom color settings
set -g @ccusage_color_normal "colour2"    # green
set -g @ccusage_color_warning "colour3"   # yellow
set -g @ccusage_color_danger "colour1"    # red
set -g @ccusage_color_inactive "colour8"  # gray
```

## Command Line Operations

### Daemon Management

```bash
# Start daemon through plugin
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux start'

# Stop daemon
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux stop'

# Check daemon status
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux status'

# One-time update
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux update'

# Clear variables
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux clear'
```

### Direct Execution

```bash
# One-time update
bun run src/daemon.ts once

# Start daemon (5 second interval)
bun run src/daemon.ts start 5000

# Stop daemon
bun run src/daemon.ts stop

# Check status
bun run src/daemon.ts status

# Clear variables
bun run src/daemon.ts clear
```

### Key Bindings

The plugin automatically sets up these key bindings:

- `prefix + C` - Show Claude Live status
- `prefix + Alt-C` - Show Claude Live configuration

### Variable Inspection

You can easily check all tmux variables set by Claude Live:

```bash
# Show all Claude Live variables in a formatted view
bash claude-live.tmux vars
# or
bash claude-live.tmux variables
# or  
bash claude-live.tmux show-vars
```

This displays:
- 📊 **Basic Information**: Active status, token usage, limits, costs
- ⏰ **Time Information**: Remaining time, session time, burn rate
- 🏥 **Health Status**: Daemon health, uptime, error rates, memory usage
- ⚠️ **Warning Information**: Warning levels, colors, health issues
- 💡 **Usage Examples**: How to use variables in tmux configuration

## 🛡️ Reliability Watchdog System

The Enhanced Daemon includes a comprehensive Reliability Watchdog system that ensures **"never display stale data"** by automatically detecting and handling data freshness issues.

### Enhanced Daemon Usage

The enhanced daemon provides all traditional functionality plus advanced reliability features:

```bash
# Start enhanced daemon with reliability monitoring
bun run src/daemon-enhanced.ts start

# Start with custom interval
bun run src/daemon-enhanced.ts start 5000

# Get comprehensive system status
bun run src/daemon-enhanced.ts status

# Force system recovery
bun run src/daemon-enhanced.ts recover

# One-time update with reliability management
bun run src/daemon-enhanced.ts once
```

### Key Reliability Features

#### 🔍 **Automatic Data Freshness Validation**
- **Fresh data**: ≤30 seconds
- **Stale data**: 30 seconds - 5 minutes  
- **Expired data**: >5 minutes (automatically managed)

#### 🚨 **Automatic Recovery System**
- Continuous daemon health monitoring (15-second intervals)
- Automatic daemon restart on failures (3 attempts with exponential backoff)
- Automatic data freshness management
- Process existence verification using PID tracking

#### 📊 **Comprehensive System Reporting**
The `status` command provides detailed reliability information:
- **System Reliability Level**: HIGH/MEDIUM/LOW/CRITICAL
- **Daemon Health Status**: Process monitoring and health metrics
- **Data Freshness Report**: Age and staleness indicators
- **Recovery Statistics**: Failure counts and last check times
- **Actionable Recommendations**: System-generated improvement suggestions

### Reliability System in Action

The system automatically manages data freshness and daemon health without requiring user intervention.

### Real-World Problem Solved

**Before:**
- Daemon stops → Data becomes 10 days old
- User sees old token usage (12.5k tokens) 
- No indication it's stale data
- Leads to incorrect usage decisions

**After:**
- Daemon stops → System detects within 15 seconds
- Data older than 5 minutes → Automatically managed
- Automatic daemon restart attempts when user returns to tmux
- User always sees current information without manual intervention

### Configuration Options

The Enhanced Daemon can be configured for different reliability requirements:

```bash
# Production settings (default)
bun run src/daemon-enhanced.ts start

# Development with faster checks
bun run src/daemon-enhanced.ts start --dev
```

## Troubleshooting

### Common Issues

#### Dependencies
**"ccusage: command not found"**
```bash
# Install ccusage
npm install -g ccusage

# Verify installation
ccusage --version
```

**"bun: command not found"**
```bash
# Install bun
curl -fsSL https://bun.sh/install | bash

# Or use mise
mise install bun
```

#### Daemon Issues
**"Another daemon is already running"**
```bash
# Stop current daemon
bun run daemon stop

# Force kill if necessary
pkill -f "daemon.ts"

# Clean up lock files
rm -f /tmp/tmux-claude-live-daemon.lock
rm -f /tmp/tmux-claude-live-daemon.pid

# Restart
bun run daemon start
```

#### Display Issues
**"Claude: Error" appears in status bar**
```bash
# Check ccusage operation
ccusage blocks --active --json

# Manual update with error details
DEBUG=true bun run daemon once

# Permission issues
chmod +x claude-live.tmux
```

**Variables not showing**
```bash
# Check tmux variables
tmux show-options -g | grep ccusage

# Manual update
bash claude-live.tmux update

# Check daemon status
bun run daemon status
```

## Development

### Build

```bash
# Development build
bun run build

# Standalone build (executable)
bun run build:standalone

# Type check
bun run typecheck

# Lint
bun run lint
```

### Testing

```bash
# Run all tests
bun test

# Unit tests
bun run test:unit

# Integration tests
bun run test:integration

# E2E tests (requires real environment)
bun run test:e2e

# Coverage
bun run test:coverage

# Watch mode
bun run test:unit:watch
```

## License

MIT License

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests first (TDD)
4. Implement the feature
5. Ensure all tests pass
6. Submit a pull request

---

📖 **Japanese documentation**: [README.ja.md](README.ja.md)

**tmux-claude-live** - Monitor your Claude Code usage efficiently and boost your productivity!