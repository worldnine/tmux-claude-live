# CcusageClient クラス仕様書

## 概要

CcusageClientは、ccusage CLIツールとの連携を担当するクラスです。ccusageコマンドを実行し、JSONレスポンスを解析して、TypeScript型として利用可能なデータ構造に変換します。

## 責務

1. ccusage blocks --active --json コマンドの実行
2. JSONレスポンスの解析とTypeScript型への変換
3. エラーハンドリング（コマンドの失敗、JSONパースエラー等）
4. データの検証と正規化

## クラス構造

```typescript
export class CcusageClient {
  async getActiveBlock(): Promise<BlockData | null>
  async getAllBlocks(): Promise<BlockData[]>
}
```

## 詳細仕様

### getActiveBlock(): Promise<BlockData | null>

#### 概要
現在アクティブなブロックの情報を取得します。

#### 処理フロー
1. `ccusage blocks --active --json` コマンドを実行
2. 標準出力をJSONとして解析
3. BlockData型に変換
4. データを返却

#### 引数
なし

#### 戻り値
- 成功時: `BlockData` - アクティブブロックの情報
- アクティブブロックがない場合: `null`
- エラー時: `null`

#### エラーハンドリング
- ccusageコマンドが見つからない場合: `null`を返す
- JSONパースエラー: `null`を返す
- 権限エラー: `null`を返す
- タイムアウト（5秒）: `null`を返す

### getAllBlocks(): Promise<BlockData[]>

#### 概要
すべてのブロックの情報を取得します。

#### 処理フロー
1. `ccusage blocks --json` コマンドを実行
2. 標準出力をJSONとして解析
3. BlockData[]型に変換
4. データを返却

#### 引数
なし

#### 戻り値
- 成功時: `BlockData[]` - すべてのブロック情報の配列
- エラー時: `[]` - 空配列

## データ型定義

### BlockData型

```typescript
export interface BlockData {
  isActive: boolean                  // ブロックがアクティブかどうか
  totalTokens: number                // 総トークン数（入力+出力）
  costUSD: number                    // 現在のコスト（USD）
  projection: {
    remainingMinutes: number         // 残り時間（分）
  }
  burnRate: {
    tokensPerMinute: number          // 1分あたりのトークン消費量
  }
  tokenCounts?: {                    // 詳細なトークン数（オプション）
    inputTokens: number              // 入力トークン数
    outputTokens: number             // 出力トークン数
    cacheCreationInputTokens?: number // キャッシュ作成用入力トークン
    cacheReadInputTokens?: number     // キャッシュ読み込み用入力トークン
  }
  models?: string[]                  // 使用されたモデル一覧（オプション）
  entries?: number                   // エントリー数（オプション）
  startTime?: string                 // ブロック開始時刻（ISO 8601形式）
  endTime?: string                   // ブロック終了予定時刻（ISO 8601形式）
}
```

## 実装例

```typescript
import { execSync } from 'child_process'

export class CcusageClient {
  private readonly COMMAND_TIMEOUT = 5000 // 5秒

  async getActiveBlock(): Promise<BlockData | null> {
    try {
      const output = execSync('ccusage blocks --active --json', { 
        encoding: 'utf8',
        timeout: this.COMMAND_TIMEOUT 
      })
      
      const data = JSON.parse(output)
      return this.transformToBlockData(data)
    } catch (error) {
      return null
    }
  }
  
  private transformToBlockData(data: any): BlockData | null {
    if (!data.blocks || data.blocks.length === 0) {
      return null
    }
    
    const block = data.blocks[0]
    
    // 必須フィールドの検証
    if (
      typeof block.isActive !== 'boolean' ||
      typeof block.totalTokens !== 'number' ||
      typeof block.costUSD !== 'number' ||
      !block.projection ||
      typeof block.projection.remainingMinutes !== 'number' ||
      !block.burnRate ||
      typeof block.burnRate.tokensPerMinute !== 'number'
    ) {
      return null
    }
    
    return {
      isActive: block.isActive,
      totalTokens: block.totalTokens,
      costUSD: block.costUSD,
      projection: {
        remainingMinutes: block.projection.remainingMinutes
      },
      burnRate: {
        tokensPerMinute: block.burnRate.tokensPerMinute
      },
      tokenCounts: block.tokenCounts,
      models: block.models,
      entries: block.entries,
      startTime: block.startTime,
      endTime: block.endTime
    }
  }
}
```

## ccusageコマンドの実際の出力例

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

## エラー処理の詳細

### コマンドが見つからない場合
```typescript
// error.message に "command not found: ccusage" が含まれる
// または "ccusage: command not found" が含まれる
```

### 権限エラー
```typescript
// error.message に "permission denied" が含まれる
// または error.code === 'EACCES'
```

### タイムアウト
```typescript
// error.code === 'ETIMEDOUT'
```

## テスト方針

1. 正常系：実際のccusageコマンドのレスポンスをモックして動作確認
2. 異常系：各種エラーケースをシミュレート
3. 境界値：空配列、不正なJSONなどのケース

## 依存関係

- Node.js標準ライブラリ: `child_process`
- 外部コマンド: `ccusage` (システムにインストール済みである必要がある)

## パフォーマンス考慮事項

1. execSyncを使用するため、非同期処理が必要な場合は呼び出し側で対応
2. タイムアウトを5秒に設定してハングアップを防止
3. 大量のデータが返される場合のメモリ使用量に注意

## セキュリティ考慮事項

1. シェルインジェクションの危険性がないよう、固定コマンドのみ実行
2. 環境変数の操作は行わない
3. 出力のサニタイズは行わない（信頼できるツールのため）