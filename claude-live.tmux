#!/usr/bin/env bash

# tmux-claude-live プラグイン
# Claude Code使用状況をリアルタイムで監視するtmuxプラグイン

CURRENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# デフォルト設定
DEFAULT_UPDATE_INTERVAL="5"
DEFAULT_TOKEN_LIMIT="140000"
DEFAULT_AUTO_START="true"
DEFAULT_DEV_MODE="false"

# 設定取得関数
get_tmux_option() {
  local option="$1"
  local default_value="$2"
  local option_value
  
  option_value=$(tmux show-option -gqv "$option")
  if [ -z "$option_value" ]; then
    echo "$default_value"
  else
    echo "$option_value"
  fi
}

# ポータブルなbun実行ファイル検索（環境非依存）
find_bun_executable() {
  # 環境変数で指定されている場合はそれを使用
  if [ -n "$BUN_EXECUTABLE" ] && command -v "$BUN_EXECUTABLE" >/dev/null 2>&1; then
    echo "$BUN_EXECUTABLE"
    return 0
  fi
  
  # 一般的なbunのインストール場所を順番に確認
  local bun_paths=(
    "bun"                           # PATH上にある場合
    "$HOME/.bun/bin/bun"           # 公式インストーラー
    "/usr/local/bin/bun"           # Homebrew
    "/opt/homebrew/bin/bun"        # Homebrew (Apple Silicon)
    "/usr/bin/bun"                 # システムインストール
  )
  
  for bun_path in "${bun_paths[@]}"; do
    if command -v "$bun_path" >/dev/null 2>&1; then
      echo "$bun_path"
      return 0
    fi
  done
  
  # 見つからない場合は警告とともにデフォルトを返す
  echo "bun"
  return 1
}

# プラグイン設定の読み込み
load_plugin_settings() {
  local update_interval
  local token_limit
  local auto_start
  local dev_mode
  
  update_interval=$(get_tmux_option "@ccusage_update_interval" "$DEFAULT_UPDATE_INTERVAL")
  token_limit=$(get_tmux_option "@ccusage_token_limit" "$DEFAULT_TOKEN_LIMIT")
  auto_start=$(get_tmux_option "@ccusage_auto_start" "$DEFAULT_AUTO_START")
  dev_mode=$(get_tmux_option "@ccusage_dev_mode" "$DEFAULT_DEV_MODE")
  
  # 緊急停止機能（一般ユーザー保護）
  if [ "$TMUX_CLAUDE_LIVE_NO_DEV" = "1" ]; then
    dev_mode="false"
  # 明示的な設定のみを受け入れ（一般ユーザー保護）
  elif [ "$dev_mode" = "true" ]; then
    dev_mode="true"
  else
    # auto含め、true以外は全てfalse（安全第一）
    dev_mode="false"
  fi
  
  # 設定を環境変数として設定
  export CCUSAGE_UPDATE_INTERVAL="$update_interval"
  export CCUSAGE_TOKEN_LIMIT="$token_limit"
  export CCUSAGE_AUTO_START="$auto_start"
  export CCUSAGE_DEV_MODE="$dev_mode"
}

# デーモンの開始
start_daemon() {
  local update_interval="$1"
  local interval_ms
  
  # 既存のデーモンを停止
  stop_daemon
  
  # 既存のプロセスを確実に終了（よりgracefulに）
  local existing_pids=$(pgrep -f "daemon.ts" 2>/dev/null || true)
  if [ -n "$existing_pids" ]; then
    echo "Stopping existing daemon processes..."
    echo "$existing_pids" | while read pid; do
      if kill -0 "$pid" 2>/dev/null; then
        kill -TERM "$pid" 2>/dev/null || true
        sleep 1
        # まだ生きている場合は強制終了
        if kill -0 "$pid" 2>/dev/null; then
          kill -KILL "$pid" 2>/dev/null || true
        fi
      fi
    done
  fi
  
  # 少し待つ
  sleep 1
  
  # 秒をミリ秒に変換
  interval_ms=$((update_interval * 1000))
  
  # bun実行ファイルを検索
  local bun_executable
  bun_executable=$(find_bun_executable)
  if [ $? -ne 0 ]; then
    echo "❌ Error: bun executable not found. Please install bun or set BUN_EXECUTABLE environment variable."
    echo "   Installation: curl -fsSL https://bun.sh/install | bash"
    return 1
  fi
  
  # デーモンコマンドの構築
  local daemon_cmd="$bun_executable run src/daemon.ts start $interval_ms"
  
  # 開発環境の場合は --dev フラグを追加
  if [ "$CCUSAGE_DEV_MODE" = "true" ]; then
    daemon_cmd="$daemon_cmd --dev"
    echo "⚠️  Starting daemon in DEVELOPMENT MODE with hot reload"
    echo "   This will impact performance. To disable: set @ccusage_dev_mode 'false'"
  fi
  
  # バックグラウンドでデーモンを開始
  cd "$CURRENT_DIR" && $daemon_cmd &
  
  # プロセスIDを記録
  local daemon_pid=$!
  
  # プロセス起動の検証（少し待ってから確認）
  sleep 2
  if kill -0 "$daemon_pid" 2>/dev/null; then
    tmux set-option -g @ccusage_daemon_pid "$daemon_pid"
    echo "✅ Claude Live daemon started successfully (PID: $daemon_pid)"
  else
    echo "❌ Error: Failed to start daemon process"
    echo "   Check bun installation and try: $bun_executable run src/daemon.ts once"
    tmux set-option -gu @ccusage_daemon_pid
    return 1
  fi
}

# デーモンの停止
stop_daemon() {
  local daemon_pid
  
  daemon_pid=$(tmux show-option -gqv @ccusage_daemon_pid)
  
  if [ -n "$daemon_pid" ] && kill -0 "$daemon_pid" 2>/dev/null; then
    kill "$daemon_pid"
    tmux set-option -gu @ccusage_daemon_pid
    echo "Claude Live daemon stopped"
  else
    echo "Claude Live daemon is not running"
  fi
}

# 状態確認
show_status() {
  local daemon_pid
  
  daemon_pid=$(tmux show-option -gqv @ccusage_daemon_pid)
  
  if [ -n "$daemon_pid" ] && kill -0 "$daemon_pid" 2>/dev/null; then
    echo "Claude Live daemon is running (PID: $daemon_pid)"
    local bun_executable
    bun_executable=$(find_bun_executable)
    if [ $? -eq 0 ]; then
      cd "$CURRENT_DIR" && "$bun_executable" run src/daemon.ts status
    else
      echo "Error: bun executable not found"
    fi
  else
    echo "Claude Live daemon is not running"
  fi
}

# 一回限りの更新
update_once() {
  echo "Updating Claude Live variables..."
  local bun_executable
  bun_executable=$(find_bun_executable)
  if [ $? -eq 0 ]; then
    cd "$CURRENT_DIR" && "$bun_executable" run src/daemon.ts once
  else
    echo "Error: bun executable not found. Please install bun."
    return 1
  fi
}

# 変数のクリア
clear_variables() {
  echo "Clearing Claude Live variables..."
  local bun_executable
  bun_executable=$(find_bun_executable)
  if [ $? -eq 0 ]; then
    cd "$CURRENT_DIR" && "$bun_executable" run src/daemon.ts clear
  else
    echo "Error: bun executable not found. Please install bun."
  fi
  stop_daemon
}

# ステータスバーの設定
setup_status_bar() {
  # 現在のstatus-rightを保存
  local current_status_right
  current_status_right=$(tmux show-option -gqv status-right 2>/dev/null)
  
  # Claude Live情報を含む新しいstatus-rightを設定
  if [[ "$current_status_right" == *"@ccusage_"* ]]; then
    # 既にClaude Live情報が含まれている場合はそのまま
    echo "Status bar already contains Claude Live information"
  else
    # 既存のステータスにClaude Live情報を追加
    if [ -z "$current_status_right" ] || [ "$current_status_right" = "default" ]; then
      # デフォルトの場合は時刻とClaude Live情報を設定
      if tmux set-option -g status-right "%H:%M %d-%b | #[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default]" 2>/dev/null; then
        echo "Status bar configured with Claude Live information"
      else
        echo "Warning: Failed to set status-right"
      fi
    else
      # 既存のステータスにClaude Live情報を追加
      if tmux set-option -g status-right "${current_status_right} | #[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default]" 2>/dev/null; then
        echo "Status bar updated with Claude Live information"
      else
        echo "Warning: Failed to update status-right"
      fi
    fi
    
    # ステータスバーの長さを十分に確保
    tmux set-option -g status-right-length 120 2>/dev/null || echo "Warning: Failed to set status-right-length"
  fi
}

# キーバインドの設定
setup_key_bindings() {
  # プレフィックス + C でClaude Live状態を表示
  if tmux bind-key C display-message "Claude Live: #{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} (#{@ccusage_usage_percent}) | #{@ccusage_time_remaining}" 2>/dev/null; then
    echo "Key binding C configured for Claude Live status"
  else
    echo "Warning: Failed to set key binding C"
  fi
  
  # プレフィックス + Alt-C でClaude Live設定を表示
  if tmux bind-key M-C display-message "Claude Live Settings: Interval=#{@ccusage_update_interval}s, Limit=#{@ccusage_token_limit}, Status=#{@ccusage_daemon_status}, DevMode=#{@ccusage_dev_mode}" 2>/dev/null; then
    echo "Key binding M-C configured for Claude Live settings"
  else
    echo "Warning: Failed to set key binding M-C"
  fi
}

# カスタムコマンドの設定
setup_custom_commands() {
  # カスタムコマンドの定義
  local commands=(
    "ccusage_command_start:run-shell 'cd $CURRENT_DIR && bash claude-live.tmux start'"
    "ccusage_command_stop:run-shell 'cd $CURRENT_DIR && bash claude-live.tmux stop'"
    "ccusage_command_status:run-shell 'cd $CURRENT_DIR && bash claude-live.tmux status'"
    "ccusage_command_update:run-shell 'cd $CURRENT_DIR && bash claude-live.tmux update'"
    "ccusage_command_clear:run-shell 'cd $CURRENT_DIR && bash claude-live.tmux clear'"
  )
  
  local success_count=0
  for cmd in "${commands[@]}"; do
    local name="${cmd%%:*}"
    local value="${cmd#*:}"
    if tmux set-option -g @"$name" "$value" 2>/dev/null; then
      success_count=$((success_count + 1))
    else
      echo "Warning: Failed to set @$name"
    fi
  done
  
  echo "Custom commands configured: $success_count/5 successful"
}

# 軽量な初期設定（tmuxサーバー起動時）
initialize_plugin() {
  # 初期化時はログを最小限に
  echo "Claude Live: Scheduling delayed initialization..." >&2
  
  # 設定の読み込み（環境変数のみ、tmuxコマンド不使用）
  load_plugin_settings
  
  # 遅延初期化を即座にスケジュール（tmuxコマンド不使用）
  schedule_delayed_initialization
}

# 遅延初期化のスケジュール
schedule_delayed_initialization() {
  # バックグラウンドで遅延初期化を実行
  (
    # tmuxサーバーの起動を十分待つ
    sleep 10
    
    # 完全な初期化を実行
    complete_initialization >/dev/null 2>&1 || {
      echo "Claude Live: Delayed initialization failed" >&2
    }
  ) >/dev/null 2>&1 &
}

# 完全な初期化処理
complete_initialization() {
  echo "Completing Claude Live initialization..."
  
  # tmuxサーバーの可用性を確認
  local max_attempts=10
  local attempt=0
  
  while [ $attempt -lt $max_attempts ]; do
    if tmux list-sessions >/dev/null 2>&1; then
      break
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  
  if [ $attempt -eq $max_attempts ]; then
    echo "❌ Error: tmux server is not ready after $max_attempts attempts"
    return 1
  fi
  
  # 完全な設定を実行
  setup_status_bar
  setup_key_bindings
  setup_custom_commands
  
  # 自動開始が有効な場合はデーモンを開始
  if [ "$CCUSAGE_AUTO_START" = "true" ]; then
    # 既存のプロセスをクリーンアップ
    local existing_pids=$(pgrep -f "daemon.ts" 2>/dev/null || true)
    if [ -n "$existing_pids" ]; then
      echo "Cleaning up existing daemon processes..."
      echo "$existing_pids" | while read pid; do
        if kill -0 "$pid" 2>/dev/null; then
          kill -TERM "$pid" 2>/dev/null || true
        fi
      done
      sleep 1
    fi
    
    start_daemon "$CCUSAGE_UPDATE_INTERVAL"
  fi
  
  echo "Claude Live initialization completed"
}

# メイン処理
main() {
  case "$1" in
    start)
      load_plugin_settings
      start_daemon "$CCUSAGE_UPDATE_INTERVAL"
      ;;
    stop)
      stop_daemon
      ;;
    status)
      show_status
      ;;
    update)
      update_once
      ;;
    clear)
      clear_variables
      ;;
    restart)
      stop_daemon
      sleep 1
      load_plugin_settings
      start_daemon "$CCUSAGE_UPDATE_INTERVAL"
      ;;
    *)
      # 引数がない場合は初期化
      initialize_plugin
      ;;
  esac
}

# スクリプトが直接実行された場合
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
  main "$@"
fi