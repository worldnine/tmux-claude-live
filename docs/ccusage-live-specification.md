# ccusage --live 機能詳細仕様書

## 概要

ccusageの`--live`機能は、Claude CodeやClaude AIの使用状況をリアルタイムで監視するためのツールです。この機能により、現在のブロック状況、トークン使用量、コスト情報、消費率などを継続的に監視できます。

## 基本的な使用方法

### コマンド形式

```bash
# 基本的なライブモニタリング
ccusage blocks --live

# JSONフォーマットでの出力
ccusage blocks --live --json

# 更新間隔を指定（デフォルト：1秒）
ccusage blocks --live --refresh-interval 2

# アクティブブロックのみ表示
ccusage blocks --active --json

# トークン制限付きの監視
ccusage blocks --active --token-limit 100000
```

### 重要なオプション

- `--live`: リアルタイムモニタリングを有効化
- `--json`: JSON形式での出力
- `--refresh-interval N`: 更新間隔を秒で指定（デフォルト：1秒）
- `--active`: アクティブブロックのみ表示
- `--token-limit N`: トークン制限を設定
- `--breakdown`: モデル別の詳細分析

## 出力形式

### 標準出力形式

```
╭────────────────────────────────╮
│                                │
│  Current Session Block Status  │
│                                │
╰────────────────────────────────╯

Block Started: 2025/7/9 19:00:00 (4h 56m ago)
Time Remaining: 0h 4m

Current Usage:
  Input Tokens:     326
  Output Tokens:    8,445
  Total Cost:       $10.94

Burn Rate:
  Tokens/minute:    22,728.839
  Cost/hour:        $2.25

Projected Usage (if current rate continues):
  Total Tokens:     6,718,578
  Total Cost:       $11.09
```

### JSON出力形式

```json
{
  "blocks": [
    {
      "id": "2025-07-09T10:00:00.000Z",
      "startTime": "2025-07-09T10:00:00.000Z",
      "endTime": "2025-07-09T15:00:00.000Z",
      "actualEndTime": "2025-07-09T14:51:57.660Z",
      "isActive": true,
      "isGap": false,
      "entries": 67,
      "tokenCounts": {
        "inputTokens": 326,
        "outputTokens": 8445,
        "cacheCreationInputTokens": 1166405,
        "cacheReadInputTokens": 5450159
      },
      "totalTokens": 8771,
      "costUSD": 10.94004345,
      "models": ["claude-sonnet-4-20250514", "claude-opus-4-20250514"],
      "burnRate": {
        "tokensPerMinute": 22728.83910562338,
        "tokensPerMinuteForIndicator": 30.089746072526548,
        "costPerHour": 2.251851301559051
      },
      "projection": {
        "totalTokens": 6724217,
        "totalCost": 11.1,
        "remainingMinutes": 4
      }
    }
  ]
}
```

## データ構造詳細

### Block情報

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | string | ブロックの一意識別子（開始時刻ベース） |
| `startTime` | string | ブロック開始時刻（ISO 8601形式） |
| `endTime` | string | ブロック終了予定時刻（5時間後） |
| `actualEndTime` | string | 実際の終了時刻（進行中の場合は現在時刻） |
| `isActive` | boolean | ブロックがアクティブかどうか |
| `isGap` | boolean | ギャップブロックかどうか（使用がない期間） |
| `entries` | number | エントリー数（API呼び出し回数） |

### Token使用量情報

```json
"tokenCounts": {
  "inputTokens": 326,                  // 入力トークン数
  "outputTokens": 8445,                // 出力トークン数
  "cacheCreationInputTokens": 1166405, // キャッシュ作成用入力トークン
  "cacheReadInputTokens": 5450159      // キャッシュ読み込み用入力トークン
}
```

### コスト情報

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `costUSD` | number | 現在の累計コスト（USD） |
| `totalTokens` | number | 総トークン数（入力+出力） |
| `models` | string[] | 使用されたモデル一覧 |

### バーンレート（消費率）情報

```json
"burnRate": {
  "tokensPerMinute": 22728.83910562338,      // 1分あたりのトークン消費量
  "tokensPerMinuteForIndicator": 30.089746,  // インジケーター用の消費量
  "costPerHour": 2.251851301559051           // 1時間あたりのコスト
}
```

### 予測情報

```json
"projection": {
  "totalTokens": 6724217,     // 予測総トークン数
  "totalCost": 11.1,          // 予測総コスト
  "remainingMinutes": 4       // 残り時間（分）
}
```

## 警告レベル判定

### トークン制限監視

```bash
# 特定のトークン制限を設定
ccusage blocks --active --token-limit 50000

# 過去の最大値を制限として使用
ccusage blocks --active --token-limit max
```

出力例：
```
Token Limit Status:
  Limit:            50,000 tokens
  Current Usage:    6,625,335 (13250.7%)
  Remaining:        0 tokens
  Projected Usage:  13440.6% EXCEEDS LIMIT
```

### 警告レベルの判定基準

- **緑（正常）**: 使用量が制限の70%以下
- **黄（注意）**: 使用量が制限の70-90%
- **赤（警告）**: 使用量が制限の90%以上または制限超過
- **時間ベース**: 残り時間が30分以下で警告

## tmux統合のための情報抽出

### 重要なフィールド

以下の情報がtmux表示に最適です：

```bash
# tmux用に最適化された情報を抽出
ccusage blocks --active --json | jq '{
  isActive: .blocks[0].isActive,
  remainingMinutes: .blocks[0].projection.remainingMinutes,
  totalTokens: .blocks[0].totalTokens,
  costUSD: .blocks[0].costUSD,
  burnRate: .blocks[0].burnRate.tokensPerMinute,
  usagePercent: ((.blocks[0].totalTokens / 140000) * 100)
}'
```

### tmux変数マッピング

| tmux変数 | ccusage JSON パス | 説明 |
|----------|-------------------|------|
| `@ccusage_is_active` | `.blocks[0].isActive` | アクティブ状態 |
| `@ccusage_remaining_minutes` | `.blocks[0].projection.remainingMinutes` | 残り時間（分） |
| `@ccusage_total_tokens` | `.blocks[0].totalTokens` | 総トークン数 |
| `@ccusage_input_tokens` | `.blocks[0].tokenCounts.inputTokens` | 入力トークン数 |
| `@ccusage_output_tokens` | `.blocks[0].tokenCounts.outputTokens` | 出力トークン数 |
| `@ccusage_cost_usd` | `.blocks[0].costUSD` | 現在のコスト |
| `@ccusage_burn_rate` | `.blocks[0].burnRate.tokensPerMinute` | トークン消費率 |
| `@ccusage_cost_per_hour` | `.blocks[0].burnRate.costPerHour` | 時間あたりコスト |
| `@ccusage_entries` | `.blocks[0].entries` | エントリー数 |

## 実装例

### 基本的な統合スクリプト

```bash
#!/bin/bash
# tmux-claude-live.sh

get_claude_status() {
    local data=$(ccusage blocks --active --json 2>/dev/null)
    
    if [[ -z "$data" ]] || [[ "$data" == "null" ]]; then
        echo "Claude: Inactive"
        return
    fi
    
    local remaining=$(echo "$data" | jq -r '.blocks[0].projection.remainingMinutes // 0')
    local tokens=$(echo "$data" | jq -r '.blocks[0].totalTokens // 0')
    local cost=$(echo "$data" | jq -r '.blocks[0].costUSD // 0')
    local burnRate=$(echo "$data" | jq -r '.blocks[0].burnRate.tokensPerMinute // 0')
    
    # 警告レベルの判定
    local color=""
    if [[ $remaining -le 30 ]]; then
        color="#[fg=red]"
    elif [[ $remaining -le 60 ]]; then
        color="#[fg=yellow]"
    else
        color="#[fg=green]"
    fi
    
    printf "${color}Claude: ${remaining}m | ${tokens} tokens | \$%.2f | %.0f/min#[default]" \
           "$cost" "$burnRate"
}

get_claude_status
```

### tmux設定例

```bash
# .tmux.confに追加
set -g status-right "#(~/scripts/tmux-claude-live.sh) | %H:%M"
set -g status-interval 5
```

## パフォーマンス考慮事項

### 更新頻度

- **デフォルト**: 1秒間隔
- **推奨（tmux用）**: 5秒間隔
- **最低**: 30秒間隔（軽量運用時）

### リソース使用量

- **CPU**: 軽量（JSONファイル読み込みのみ）
- **メモリ**: 最小限
- **ディスク**: 読み取り専用

## 制限事項と注意点

### 制限事項

1. **データソース**: ローカルのJSONLファイルに依存
2. **リアルタイム性**: 実際の使用から若干の遅延がある可能性
3. **プラットフォーム**: Node.js環境が必要

### 注意点

1. **ファイルパス**: Claude Codeのデータファイルの場所を正しく設定する必要がある
2. **権限**: データファイルへの読み取り権限が必要
3. **更新頻度**: 高頻度の更新はシステムリソースを消費する可能性
4. **エラーハンドリング**: ccusageコマンドの失敗時の処理が必要

## 実際のコマンド例

```bash
# 基本的な監視
ccusage blocks --live

# JSON形式での監視（自動化向け）
ccusage blocks --live --json --refresh-interval 5

# アクティブブロックのみ表示
ccusage blocks --active --json

# トークン制限付きの監視
ccusage blocks --active --token-limit 100000

# 詳細な分析（モデル別）
ccusage blocks --active --breakdown

# デバッグ情報付き
ccusage blocks --active --debug
```

## 高度な使用例

### 複数ブロックの監視

```bash
# 最近のブロックを含む監視
ccusage blocks --recent --live --json
```

### 条件付き監視

```bash
# 特定の条件での監視
ccusage blocks --active --json --since 2025-01-01
```

### カスタム出力

```bash
# 特定のフィールドのみ抽出
ccusage blocks --active --json | jq '.blocks[0] | {
  remaining: .projection.remainingMinutes,
  tokens: .totalTokens,
  cost: .costUSD
}'
```

## 結論

ccusageの`--live`機能は、Claude Codeの使用状況をリアルタイムで監視するための強力なツールです。JSON出力により、tmux統合やその他の自動化ツールとの連携が容易になります。特に、5時間ブロック制限の監視、トークン消費率の追跡、コスト予測など、tmux-claude-liveプロジェクトに必要な全ての情報を提供しています。

このドキュメントの情報を基に、効率的で柔軟なtmux統合システムを構築することができます。