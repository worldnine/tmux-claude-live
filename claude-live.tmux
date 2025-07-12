#!/usr/bin/env bash

# tmux-claude-live プラグイン
# Claude Code使用状況をリアルタイムで監視するtmuxプラグイン

CURRENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# デフォルト設定
DEFAULT_UPDATE_INTERVAL="5"
DEFAULT_TOKEN_LIMIT="140000"
DEFAULT_AUTO_START="true"

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

# プラグイン設定の読み込み
load_plugin_settings() {
  local update_interval
  local token_limit
  local auto_start
  
  update_interval=$(get_tmux_option "@ccusage_update_interval" "$DEFAULT_UPDATE_INTERVAL")
  token_limit=$(get_tmux_option "@ccusage_token_limit" "$DEFAULT_TOKEN_LIMIT")
  auto_start=$(get_tmux_option "@ccusage_auto_start" "$DEFAULT_AUTO_START")
  
  # 設定を環境変数として設定
  export CCUSAGE_UPDATE_INTERVAL="$update_interval"
  export CCUSAGE_TOKEN_LIMIT="$token_limit"
  export CCUSAGE_AUTO_START="$auto_start"
}

# デーモンの開始
start_daemon() {
  local update_interval="$1"
  local interval_ms
  
  # 秒をミリ秒に変換
  interval_ms=$((update_interval * 1000))
  
  # バックグラウンドでデーモンを開始
  cd "$CURRENT_DIR" && bun run src/daemon.ts start "$interval_ms" &
  
  # プロセスIDを記録
  local daemon_pid=$!
  tmux set-option -g @ccusage_daemon_pid "$daemon_pid"
  
  echo "Claude Live daemon started (PID: $daemon_pid)"
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
    cd "$CURRENT_DIR" && bun run src/daemon.ts status
  else
    echo "Claude Live daemon is not running"
  fi
}

# 一回限りの更新
update_once() {
  echo "Updating Claude Live variables..."
  cd "$CURRENT_DIR" && bun run src/daemon.ts once
}

# 変数のクリア
clear_variables() {
  echo "Clearing Claude Live variables..."
  cd "$CURRENT_DIR" && bun run src/daemon.ts clear
  stop_daemon
}

# ステータスバーの設定
setup_status_bar() {
  # 現在のstatus-rightを保存
  local current_status_right
  current_status_right=$(tmux show-option -gqv status-right)
  
  # Claude Live情報を含む新しいstatus-rightを設定
  if [[ "$current_status_right" == *"@ccusage_"* ]]; then
    # 既にClaude Live情報が含まれている場合はそのまま
    echo "Status bar already contains Claude Live information"
  else
    # 既存のステータスにClaude Live情報を追加
    if [ -z "$current_status_right" ] || [ "$current_status_right" = "default" ]; then
      # デフォルトの場合は時刻とClaude Live情報を設定
      tmux set-option -g status-right "%H:%M %d-%b | #[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default]"
    else
      # 既存のステータスにClaude Live情報を追加
      tmux set-option -g status-right "${current_status_right} | #[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default]"
    fi
    
    # ステータスバーの長さを十分に確保
    tmux set-option -g status-right-length 120
  fi
}

# キーバインドの設定
setup_key_bindings() {
  # プレフィックス + C でClaude Live状態を表示
  tmux bind-key C display-message "Claude Live: #{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} (#{@ccusage_usage_percent}) | #{@ccusage_time_remaining}"
  
  # プレフィックス + Alt-C でClaude Live設定を表示
  tmux bind-key M-C display-message "Claude Live Settings: Interval=#{@ccusage_update_interval}s, Limit=#{@ccusage_token_limit}, Status=#{@ccusage_daemon_status}"
}

# カスタムコマンドの設定
setup_custom_commands() {
  # カスタムコマンドの定義
  tmux set-option -g @ccusage_command_start "run-shell 'cd $CURRENT_DIR && bash claude-live.tmux start'"
  tmux set-option -g @ccusage_command_stop "run-shell 'cd $CURRENT_DIR && bash claude-live.tmux stop'"
  tmux set-option -g @ccusage_command_status "run-shell 'cd $CURRENT_DIR && bash claude-live.tmux status'"
  tmux set-option -g @ccusage_command_update "run-shell 'cd $CURRENT_DIR && bash claude-live.tmux update'"
  tmux set-option -g @ccusage_command_clear "run-shell 'cd $CURRENT_DIR && bash claude-live.tmux clear'"
}

# 初期設定
initialize_plugin() {
  echo "Initializing Claude Live plugin..."
  
  # 設定の読み込み
  load_plugin_settings
  
  # プラグイン情報の設定
  tmux set-option -g @ccusage_plugin_version "1.0.0"
  tmux set-option -g @ccusage_plugin_path "$CURRENT_DIR"
  tmux set-option -g @ccusage_daemon_status "initialized"
  
  # ステータスバーの設定
  setup_status_bar
  
  # キーバインドの設定
  setup_key_bindings
  
  # カスタムコマンドの設定
  setup_custom_commands
  
  # 自動開始が有効な場合は即座に開始
  if [ "$CCUSAGE_AUTO_START" = "true" ]; then
    start_daemon "$CCUSAGE_UPDATE_INTERVAL"
  fi
  
  echo "Claude Live plugin initialized"
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