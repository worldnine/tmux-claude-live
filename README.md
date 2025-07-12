# tmux-claude-live

tmux変数システムを通じてClaude Code使用状況をリアルタイムモニタリングするツール

## 概要

**tmux-claude-live**は、[ccusage](https://github.com/ryoppippi/ccusage)の`--live`機能を活用してClaude Code使用状況をtmux変数として提供し、ユーザーが自由にカスタマイズできるリアルタイムモニタリングツールです。

### 主な特徴

- **リアルタイム監視**: トークン使用量、消費率、コストをリアルタイムで追跡
- **5時間ブロック追跡**: Claude Codeの請求ブロック管理
- **セッション残り時間**: セッションの残り時間を表示
- **スマートな色分け**: 使用状況と残り時間に応じた視覚的警告
- **高いカスタマイズ性**: tmux変数を使用した完全な自由度
- **tmuxネイティブ**: tmuxの変数システムを最大限活用

## インストール

### 前提条件

- [Bun](https://bun.sh/) runtime
- [ccusage](https://github.com/ryoppippi/ccusage) command-line tool
- tmux

### セットアップ

1. **依存関係のインストール**:
```bash
# ccusageのインストール
npm install -g ccusage

# mise (Node.js/Bun管理ツール)のインストール
curl https://mise.run | sh
```

2. **プロジェクトの取得とビルド**:
```bash
git clone <repository-url>
cd tmux-claude-live
mise install
bun install
bun run build
```

3. **tmux設定への追加**:
```bash
# ~/.tmux.confに追加
run-shell '/path/to/tmux-claude-live/claude-live.tmux'

# tmux設定の再読み込み
tmux source-file ~/.tmux.conf
```

## 使用方法

### 基本的な使用

プラグインは自動的にtmux変数を設定し、ユーザーが自由にカスタマイズできます：

```bash
# 基本的な表示例
set -g status-right "#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} | #{@ccusage_time_remaining} | %H:%M"

# 色付き表示
set -g status-right "#[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default] | #{@ccusage_time_remaining} | %H:%M"
```

### 利用可能な変数

#### 基本情報
- `@ccusage_is_active` - ブロックがアクティブか (`true`/`false`)
- `@ccusage_total_tokens` - 総トークン数 (`20086`)
- `@ccusage_total_tokens_formatted` - フォーマット済みトークン数 (`20.1k`)
- `@ccusage_cost_current` - 現在のコスト (`$20.98`)

#### 時間情報
- `@ccusage_time_remaining` - 残り時間 (`3h11m`)
- `@ccusage_session_time_remaining` - セッション残り時間 (`3h6m`)
- `@ccusage_remaining_seconds` - 残り時間（秒）
- `@ccusage_session_remaining_seconds` - セッション残り時間（秒）

#### 使用率情報
- `@ccusage_usage_percent` - 使用率 (`14.35%`)
- `@ccusage_tokens_remaining` - 残りトークン数
- `@ccusage_tokens_remaining_formatted` - フォーマット済み残りトークン数 (`119.9k`)
- `@ccusage_token_limit` - トークン制限数
- `@ccusage_token_limit_formatted` - フォーマット済み制限数 (`140k`)

#### 消費率情報
- `@ccusage_burn_rate` - トークン消費率（raw値）
- `@ccusage_burn_rate_formatted` - フォーマット済み消費率 (`184/min`)
- `@ccusage_cost_per_hour` - 時間あたりコスト

#### 警告・色情報
- `@ccusage_warning_level` - 警告レベル (`normal`/`warning`/`danger`)
- `@ccusage_warning_color` - 警告色 (`colour2`/`colour3`/`colour1`)
- `@ccusage_warning_color_name` - 警告色名 (`green`/`yellow`/`red`)

### カスタマイズ例

#### シンプル版
```bash
set -g status-right \"⏱ #{@ccusage_time_remaining} | 🎯 #{@ccusage_tokens_remaining_formatted} (#{@ccusage_usage_percent})\"
```

#### 詳細版
```bash
set -g status-right \"#[fg=#{@ccusage_warning_color}]Claude: #{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} (#{@ccusage_usage_percent}) | #{@ccusage_burn_rate_formatted} | ⏱ #{@ccusage_time_remaining} | #{@ccusage_cost_current}#[default]\"
```

#### セッション時間込み
```bash
set -g status-right \"#[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted}#[default] | T:#{@ccusage_time_remaining} S:#{@ccusage_session_time_remaining} | %H:%M\"
set -g status-right-length 150
```

#### 複数箇所配置
```bash
set -g status-left \"#[fg=#{@ccusage_warning_color}]●#[default] #{session_name}\"
set -g status-right \"#{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} | #{@ccusage_time_remaining} | %H:%M\"
```

## 設定オプション

### tmux変数による設定

```bash
# 更新間隔（秒、デフォルト: 5）
set -g @ccusage_update_interval 10

# トークン制限（デフォルト: 140000）
set -g @ccusage_token_limit 100000

# 警告レベルのしきい値（デフォルト: 70%, 90%）
set -g @ccusage_warning_threshold_1 60
set -g @ccusage_warning_threshold_2 80

# 時間警告のしきい値（デフォルト: 60分, 30分）
set -g @ccusage_time_warning_1 90
set -g @ccusage_time_warning_2 45

# 表示形式
set -g @ccusage_time_format \"compact\"     # compact/verbose/short
set -g @ccusage_cost_format \"currency\"    # currency/number/compact
set -g @ccusage_token_format \"compact\"    # compact/full/short

# 自動開始（デフォルト: true）
set -g @ccusage_auto_start \"false\"
```

### 色設定

```bash
# カスタム色の設定
set -g @ccusage_color_normal \"colour2\"    # 緑
set -g @ccusage_color_warning \"colour3\"   # 黄
set -g @ccusage_color_danger \"colour1\"    # 赤
set -g @ccusage_color_inactive \"colour8\"  # グレー
```

## コマンドライン操作

### デーモン管理

```bash
# プラグインを通じてデーモンを開始
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux start'

# デーモンを停止
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux stop'

# デーモンの状態確認
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux status'

# 一回限りの更新
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux update'

# 変数をクリア
tmux run-shell 'cd /path/to/tmux-claude-live && bash claude-live.tmux clear'
```

### 直接実行

```bash
# 一回限りの更新
bun run src/daemon.ts once

# デーモンを開始（5秒間隔）
bun run src/daemon.ts start 5000

# デーモンを停止
bun run src/daemon.ts stop

# 状態確認
bun run src/daemon.ts status

# 変数をクリア
bun run src/daemon.ts clear
```

### キーバインド

プラグインは以下のキーバインドを自動設定します：

- `prefix + C` - Claude Live状態を表示
- `prefix + Alt-C` - Claude Live設定を表示

## 開発

### TDD開発フロー

このプロジェクトはTest-Driven Developmentを採用しています：

```bash
# テストの実行
bun test

# ウォッチモード
bun test --watch

# カバレッジ
bun test --coverage

# 特定のパターンをテスト
bun test -t \"should format time\"
```

### プロジェクト構造

```
tmux-claude-live/
├── src/
│   ├── core/                    # コア機能
│   │   ├── CcusageClient.ts     # ccusage API呼び出し
│   │   ├── DataProcessor.ts     # データ処理・計算
│   │   └── ConfigManager.ts     # 設定管理
│   ├── formatters/              # フォーマッター
│   │   ├── TimeFormatter.ts     # 時間表示形式
│   │   ├── TokenFormatter.ts    # トークン表示形式
│   │   └── CostFormatter.ts     # コスト表示形式
│   ├── tmux/                    # tmux統合
│   │   ├── VariableManager.ts   # tmux変数管理
│   │   ├── ColorResolver.ts     # 色決定ロジック
│   │   └── StatusUpdater.ts     # ステータス更新
│   ├── utils/                   # ユーティリティ
│   │   ├── Logger.ts            # ログ管理
│   │   ├── ErrorHandler.ts      # エラーハンドリング
│   │   └── CommandExecutor.ts   # コマンド実行抽象化
│   └── daemon.ts                # デーモン本体
├── test/                        # テストファイル
├── docs/                        # ドキュメント
├── claude-live.tmux             # tmuxプラグイン本体
└── scripts/                     # スクリプト
```

### ビルド

```bash
# 開発ビルド
bun run build

# 本番ビルド
bun run build:production

# 型チェック
bun run typecheck

# リント
bun run lint
```

## トラブルシューティング

### よくある問題

1. **\"ccusage: command not found\"**
   ```bash
   # ccusageをインストール
   npm install -g ccusage
   ```

2. **\"Claude: Error\" がステータスバーに表示される**
   - ccusageの設定を確認
   - tmux-claude-liveの権限を確認
   - ccusageが正常に動作することを確認: `ccusage blocks --active --json`

3. **データが表示されない**
   - Claude Codeを最近使用したことを確認
   - ccusageの出力をチェック: `ccusage blocks --active --json`
   - デーモンが実行されているか確認: `bash claude-live.tmux status`

4. **変数が更新されない**
   - デーモンが実行されているか確認
   - 手動で一度更新: `bash claude-live.tmux update`
   - tmux変数を確認: `tmux show-options -g | grep ccusage`

### デバッグモード

```bash
# 直接実行してデバッグ
bun run src/daemon.ts once

# ccusage統合のテスト
ccusage blocks --active --json

# tmux変数の確認
tmux show-options -g | grep ccusage

# デーモンの状態確認
ps aux | grep \"daemon.ts\"
```

### ログ確認

```bash
# tmuxのメッセージを確認
tmux show-messages

# バックグラウンドプロセスの確認
jobs

# プロセスの詳細確認
tmux show-option -gv @ccusage_daemon_pid
```

## パフォーマンス

### 最適化

- **5秒間隔での更新**: CPU負荷を最小限に抑制
- **30秒TTLキャッシュ**: 不要な処理を削減
- **指数バックオフリトライ**: 障害時の効率的な回復
- **構造化ログ**: パフォーマンス監視とデバッグ支援
- **自動エラー回復**: 8種類のエラー分類と適切な対応

### メモリ・CPU使用量

- **メモリ**: 約10-20MB
- **CPU**: 通常時0.1%未満
- **ネットワーク**: なし（ローカルファイル読み取りのみ）

## ライセンス

MIT License

## 貢献

1. リポジトリをフォーク
2. 機能ブランチを作成
3. テストを先に書く（TDD）
4. 機能を実装
5. 全テストが通ることを確認
6. プルリクエストを送信

### 開発ルール

- **TDD必須**: テストを先に書く
- **日本語仕様書**: RED状態で日本語仕様書を作成
- **100%テストカバレッジ**: すべてのコードをテスト
- **型安全**: TypeScriptの型チェックを厳格に

---

**tmux-claude-live**で、Claude Code使用状況を効率的に監視し、生産性を向上させましょう！