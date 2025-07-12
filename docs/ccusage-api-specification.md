# ccusage API仕様書

## 概要

ccusage は ryoppippi 氏によって開発された、Claude Desktopのローカル使用量データを分析するためのCLIツールです。

- **リポジトリ**: https://github.com/ryoppippi/ccusage
- **ドキュメント**: https://ccusage.com/
- **データソース**: Claude Desktopの `.claude/` ディレクトリ内のJSONLファイル
- **出力形式**: JSON, テキスト（色付き）

**注意**: このドキュメントは基本的なAPI仕様を記載しています。
詳細な`--live`機能については、[ccusage-live-specification.md](./ccusage-live-specification.md)を参照してください。

## 基本的な使用方法

```bash
# 基本的な日次レポート
ccusage daily

# JSON形式での出力
ccusage daily --json

# 月次レポート
ccusage monthly

# セッション別レポート
ccusage session

# 5時間ブロック分析
ccusage blocks

# リアルタイム監視
ccusage blocks --live
```

## 重要なオプション

- `--json`: 構造化されたJSON形式で出力
- `--since YYYYMMDD`: 開始日の指定
- `--until YYYYMMDD`: 終了日の指定
- `--breakdown`: モデル別の詳細分析

## データ構造

### 基本的なUsageData型

```typescript
type UsageData = {
  timestamp: string;  // ISO 8601形式の日時
  message: {
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    model?: string;  // 例: "claude-3-sonnet-20240229"
  };
  costUSD?: number;  // 計算されたコスト（USD）
}
```

### DailyUsage型

```typescript
type DailyUsage = {
  date: string;  // YYYY-MM-DD形式
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];  // 使用されたモデル一覧
  modelBreakdowns: {
    [modelName: string]: {
      inputTokens: number;
      outputTokens: number;
      cost: number;
    }
  };
}
```

### SessionUsage型

```typescript
type SessionUsage = {
  sessionId: string;
  startTime: string;
  endTime: string;
  totalTokens: number;
  totalCost: number;
  messagesCount: number;
  models: string[];
}
```

### MonthlyUsage型

```typescript
type MonthlyUsage = {
  month: string;  // YYYY-MM形式
  totalTokens: number;
  totalCost: number;
  dailyBreakdown: DailyUsage[];
}
```

## コマンド別JSON出力形式

### `ccusage daily --json`

```json
{
  "daily": [
    {
      "date": "2024-01-01",
      "inputTokens": 15000,
      "outputTokens": 8000,
      "cacheCreationTokens": 2000,
      "cacheReadTokens": 1000,
      "totalTokens": 23000,
      "totalCost": 0.345,
      "modelsUsed": ["claude-3-sonnet-20240229"],
      "modelBreakdowns": {
        "claude-3-sonnet-20240229": {
          "inputTokens": 15000,
          "outputTokens": 8000,
          "cost": 0.345
        }
      }
    }
  ],
  "totals": {
    "totalTokens": 23000,
    "totalCost": 0.345,
    "daysActive": 1
  }
}
```

### `ccusage session --json`

```json
{
  "sessions": [
    {
      "sessionId": "session_abc123",
      "startTime": "2024-01-01T10:00:00Z",
      "endTime": "2024-01-01T11:30:00Z",
      "totalTokens": 23000,
      "totalCost": 0.345,
      "messagesCount": 15,
      "models": ["claude-3-sonnet-20240229"]
    }
  ],
  "totals": {
    "totalSessions": 1,
    "totalTokens": 23000,
    "totalCost": 0.345
  }
}
```

### `ccusage blocks --json`

```json
{
  "blocks": [
    {
      "blockId": "block_001",
      "startTime": "2024-01-01T10:00:00Z",
      "endTime": "2024-01-01T15:00:00Z",
      "duration": 18000000,  // 5時間（ミリ秒）
      "totalTokens": 120000,
      "totalCost": 1.85,
      "sessions": ["session_abc123", "session_def456"],
      "isActive": false
    }
  ],
  "currentBlock": {
    "blockId": "block_002",
    "startTime": "2024-01-01T16:00:00Z",
    "elapsedTime": 3600000,  // 1時間経過
    "remainingTime": 14400000,  // 4時間残り
    "totalTokens": 25000,
    "totalCost": 0.425,
    "burnRate": 416.67,  // tokens per minute
    "isActive": true
  }
}
```

## モデル名の正規化

ccusageは詳細なモデル名を返しますが、一般的な使用では以下のように正規化します：

```typescript
const normalizeModelName = (model: string): string => {
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('opus')) return 'opus';
  if (model.includes('haiku')) return 'haiku';
  return model;
};
```

## 料金体系（2024年時点）

```typescript
const MODEL_PRICING = {
  'claude-3-sonnet-20240229': {
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.000015,
    cache_creation_input_token_cost: 0.0000075,
    cache_read_input_token_cost: 0.0000003
  },
  'claude-3-opus-20240229': {
    input_cost_per_token: 0.000015,
    output_cost_per_token: 0.000075
  },
  'claude-3-haiku-20240307': {
    input_cost_per_token: 0.0000008,
    output_cost_per_token: 0.000004
  }
};
```

## データの場所

ccusageは以下の場所からデータを読み込みます：

- **macOS**: `~/Library/Application Support/Claude/conversations/`
- **Windows**: `%APPDATA%/Claude/conversations/`
- **Linux**: `~/.config/Claude/conversations/`

## エラーハンドリング

ccusageが失敗する可能性のある場合：

1. **Claude Desktopがインストールされていない**
2. **データファイルが存在しない**
3. **権限がない**
4. **データファイルが破損している**

```bash
# エラー時の標準出力例
ccusage daily --json
# 出力: {"error": "No data found", "code": "NO_DATA"}
```

## tmux-claude-liveでの統合方法

```typescript
// CcusageAdapterの基本実装
async function loadCcusageData() {
  try {
    const output = execSync('ccusage daily --json', { encoding: 'utf8' });
    return JSON.parse(output);
  } catch (error) {
    return { daily: [], totals: { totalTokens: 0, totalCost: 0 } };
  }
}
```

## 制限事項

1. **非公式ツール**: Anthropic公式ではない
2. **ローカルデータ依存**: Claude Desktopのローカルファイルに依存
3. **フォーマット変更リスク**: 将来的にデータ形式が変更される可能性
4. **リアルタイム性**: Claude Desktopのデータ更新タイミングに依存

## 更新履歴

- 2024-01-09: 初版作成、基本的なAPI仕様を記載
- 今後の更新時は、ccusageのバージョンアップに合わせて追記予定