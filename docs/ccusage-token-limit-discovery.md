# ccusage制限値機能の発見と活用

## 概要

2025年7月12日の調査により、ccusageには制限値（token limit）設定機能が存在することが判明しました。この発見により、tmux-claude-liveプロジェクトの設計が大幅に改善されました。

## 重要な発見

### ccusageの制限値機能

ccusageには`--token-limit`オプションが存在し、制限値を指定することで詳細な使用状況分析が可能です。

```bash
# 制限値を指定してccusageを実行
ccusage blocks --active --json --token-limit 140000
```

### tokenLimitStatusフィールド

制限値を指定した場合、JSONレスポンスに`tokenLimitStatus`オブジェクトが追加されます：

```json
{
  "blocks": [
    {
      "id": "2025-07-12T09:00:00.000Z",
      "isActive": true,
      "totalTokens": 3877,
      "costUSD": 4.516823549999999,
      "tokenLimitStatus": {
        "limit": 140000,
        "projectedUsage": 115811805,
        "percentUsed": 82722.71785714285,
        "status": "exceeds"
      }
    }
  ]
}
```

### statusフィールドの値

ccusageの`status`フィールドは以下の値を取ります：

- `"ok"`: 正常範囲内
- `"warning"`: 警告レベル
- `"exceeds"`: 制限値超過

## 技術的影響

### 従来の想定

- ccusageには制限値設定機能がない
- tmux-claude-live独自で制限値を管理
- 独自計算で使用率や警告レベルを判定

### 新しい実装

- ccusageの正式な制限値機能を活用
- ccusageの計算結果（`percentUsed`, `status`）を優先使用
- より正確で一貫性のある監視機能

## 実装変更

### CcusageClient

```typescript
// 制限値パラメータを追加
async getActiveBlock(tokenLimit?: number): Promise<BlockData | null>

// TokenLimitStatusインターフェース追加
export interface TokenLimitStatus {
  limit: number
  projectedUsage: number
  percentUsed: number
  status: string
}
```

### DataProcessor

```typescript
// ccusageの計算結果を優先使用
if (blockData.tokenLimitStatus) {
  usagePercent = blockData.tokenLimitStatus.percentUsed
  warningLevel = this.mapCcusageStatusToWarningLevel(blockData.tokenLimitStatus.status)
} else if (tokenLimit) {
  // フォールバック：独自計算
  usagePercent = (totalTokens / tokenLimit) * 100
  warningLevel = this.determineWarningLevel(usagePercent)
}
```

### 警告レベルマッピング

```typescript
private mapCcusageStatusToWarningLevel(status: string): 'normal' | 'warning' | 'danger' {
  switch (status.toLowerCase()) {
    case 'exceeds':
    case 'danger':
      return 'danger'
    case 'warning':
    case 'high':
      return 'warning'
    case 'ok':
    case 'normal':
    case 'good':
    default:
      return 'normal'
  }
}
```

## 設定方法

### tmux変数での制限値設定

```bash
# ~/.tmux.conf
set -g @ccusage_token_limit "140000"  # Claude Pro標準制限値
set -g @ccusage_token_limit "300000"  # Claude Pro Max制限値
```

### 使用例

```bash
# シンプル版（制限値設定時のみ使用率表示）
set -g status-right "#{@ccusage_total_tokens_formatted} #{?@ccusage_has_token_limit,(#{@ccusage_usage_percent}),}"

# 条件付き表示版
set -g status-right "#{@ccusage_total_tokens_formatted}#{?@ccusage_has_token_limit, | #{@ccusage_usage_percent} | #[fg=#{@ccusage_warning_color}]#{@ccusage_warning_level}#[default],}"
```

## 利点

### 1. 精度の向上

- ccusageの正確な計算ロジックを活用
- プロジェクション（予測使用量）も含めた総合的な判定
- バーンレートと残り時間を考慮した高度な計算

### 2. 一貫性

- ccusageコマンドラインツールと同じ判定基準
- ユーザーが`ccusage blocks --active`で見る内容と一致
- 独自実装による誤差の排除

### 3. 保守性

- ccusageの機能更新に自動的に追従
- 独自の複雑な計算ロジックが不要
- より少ないコードで高機能を実現

## フォールバック戦略

### 制限値未設定時

- 基本監視機能のみ提供（使用量、コスト、burn rate）
- 制限値依存機能は非表示（使用率、警告色、予測）

### ccusageエラー時

- 制限値が設定されている場合は独自計算でフォールバック
- エラー状態をtmux変数で通知

## 今後の展望

### 拡張可能性

- ccusageの新機能への対応が容易
- 複数制限値（日次/月次）の将来的なサポート
- より詳細な使用状況分析の活用

### インテグレーション

- Claude Code本体との連携強化
- リアルタイム制限値更新の可能性
- API経由での制限値取得

## 関連ファイル

- `src/core/CcusageClient.ts`: 制限値パラメータ対応
- `src/core/DataProcessor.ts`: ccusage計算結果の優先使用
- `src/tmux/StatusUpdater.ts`: 制限値連携ロジック
- `test/unit/core/DataProcessor.test.ts`: ccusage statusベーステスト

## 参考リンク

- [ccusage公式ドキュメント](https://ccusage.com/)
- [ccusage GitHub リポジトリ](https://github.com/ryoppippi/ccusage)
- [tmux-claude-live設計ドキュメント](./tmux-variables-design.md)

---

この発見により、tmux-claude-liveはより正確で信頼性の高い監視ツールとして進化しました。