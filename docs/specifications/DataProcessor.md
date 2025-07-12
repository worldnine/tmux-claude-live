# DataProcessor クラス仕様書

## 概要

DataProcessorは、CcusageClientから取得したブロックデータを処理し、tmux表示用の情報に変換するクラスです。使用率計算、残り時間計算、警告レベル判定など、データの加工と計算を担当します。

## 責務

1. ブロックデータの処理と計算
2. 使用率・残り時間・進捗率の計算
3. 警告レベルの判定（使用率ベース・時間ベース）
4. コスト計算（時間あたりのコスト）
5. データの正規化と検証

## クラス構造

```typescript
export class DataProcessor {
  processBlockData(blockData: BlockData | null, tokenLimit: number): ProcessedData
  calculateCostPerHour(burnRate: number): number
}
```

## 詳細仕様

### processBlockData(blockData: BlockData | null, tokenLimit: number): ProcessedData

#### 概要
ブロックデータを受け取り、表示用のデータに変換します。

#### 処理フロー
1. 入力データの検証と正規化
2. 基本情報の抽出
3. 使用率の計算
4. 残り時間の変換
5. ブロック進捗率の計算
6. 警告レベルの判定
7. ProcessedData型として返却

#### 引数
- `blockData`: CcusageClientから取得したブロックデータ（nullの場合あり）
- `tokenLimit`: トークン制限数（デフォルト: 140000）

#### 戻り値
- `ProcessedData`: 処理済みのデータ

#### 計算ロジック

##### 使用率計算
```typescript
usagePercent = (totalTokens / tokenLimit) * 100
```

##### 残りトークン数計算
```typescript
tokensRemaining = tokenLimit - totalTokens
```

##### ブロック進捗率計算
```typescript
// 5時間ブロック（300分）を基準
elapsedMinutes = 300 - remainingMinutes
blockProgress = (elapsedMinutes / 300) * 100
```

##### 警告レベル判定
1. **使用率ベース**
   - 70%未満: `normal`（緑）
   - 70%以上90%未満: `warning`（黄）
   - 90%以上: `danger`（赤）

2. **時間ベース**（使用率が正常範囲でも適用）
   - 60分超: `normal`
   - 30分以上60分以下: `warning`
   - 30分未満: `danger`

3. **最終判定**: より厳しい方を採用

### calculateCostPerHour(burnRate: number): number

#### 概要
トークン消費率から1時間あたりのコストを計算します。

#### 処理フロー
1. 分あたりのトークン数を時間あたりに変換
2. トークン単価を掛けてコストを計算

#### 引数
- `burnRate`: 1分あたりのトークン消費量

#### 戻り値
- `number`: 1時間あたりのコスト（USD）

#### 計算ロジック
```typescript
const COST_PER_TOKEN = 0.000015 // 仮定値
costPerHour = burnRate * 60 * COST_PER_TOKEN
```

## データ型定義

### ProcessedData型

```typescript
export interface ProcessedData {
  // 基本情報
  isActive: boolean                    // ブロックがアクティブかどうか
  totalTokens: number                  // 総トークン数
  costUSD: number                      // 現在のコスト（USD）
  
  // 時間情報
  remainingMinutes: number             // 残り時間（分）
  remainingSeconds: number             // 残り時間（秒）
  
  // 使用率情報
  usagePercent: number                 // 使用率（%）
  tokensRemaining: number              // 残りトークン数
  blockProgress: number                // ブロック進捗率（%）
  
  // 消費率情報
  burnRate: number                     // トークン消費率（tokens/min）
  costPerHour: number                  // 時間あたりコスト（USD/hour）
  
  // 警告情報
  warningLevel: 'normal' | 'warning' | 'danger'  // 警告レベル
  
  // オプション情報
  tokenCounts?: {                      // 詳細なトークン数
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
  }
  models?: string[]                    // 使用モデル一覧
  entries?: number                     // エントリー数
}
```

## エラーハンドリング

### null入力の処理
blockDataがnullの場合、以下のデフォルト値を返します：

```typescript
{
  isActive: false,
  totalTokens: 0,
  costUSD: 0,
  remainingMinutes: 0,
  remainingSeconds: 0,
  usagePercent: 0,
  tokensRemaining: tokenLimit,
  blockProgress: 0,
  burnRate: 0,
  costPerHour: 0,
  warningLevel: 'normal'
}
```

### 不正な値の正規化
- 負の値はすべて0に変換
- NaNやInfinityは0に変換
- 使用率が100%を超える場合も適切に処理

## 実装例

```typescript
export class DataProcessor {
  private readonly COST_PER_TOKEN = 0.000015  // $0.000015 per token
  private readonly BLOCK_DURATION_MINUTES = 300  // 5時間 = 300分
  
  processBlockData(blockData: BlockData | null, tokenLimit: number): ProcessedData {
    // nullチェック
    if (!blockData) {
      return this.getDefaultProcessedData(tokenLimit)
    }
    
    // 値の正規化
    const totalTokens = Math.max(0, blockData.totalTokens)
    const costUSD = Math.max(0, blockData.costUSD)
    const remainingMinutes = Math.max(0, blockData.projection.remainingMinutes)
    const burnRate = Math.max(0, blockData.burnRate.tokensPerMinute)
    
    // 計算
    const usagePercent = (totalTokens / tokenLimit) * 100
    const tokensRemaining = Math.max(0, tokenLimit - totalTokens)
    const remainingSeconds = remainingMinutes * 60
    const elapsedMinutes = this.BLOCK_DURATION_MINUTES - remainingMinutes
    const blockProgress = Math.min(100, (elapsedMinutes / this.BLOCK_DURATION_MINUTES) * 100)
    const costPerHour = this.calculateCostPerHour(burnRate)
    
    // 警告レベル判定
    const warningLevel = this.determineWarningLevel(usagePercent, remainingMinutes)
    
    return {
      isActive: blockData.isActive,
      totalTokens,
      costUSD,
      remainingMinutes,
      remainingSeconds,
      usagePercent: Math.round(usagePercent * 100) / 100,  // 小数点2桁
      tokensRemaining,
      blockProgress: Math.round(blockProgress),
      burnRate,
      costPerHour,
      warningLevel,
      tokenCounts: blockData.tokenCounts,
      models: blockData.models,
      entries: blockData.entries
    }
  }
  
  calculateCostPerHour(burnRate: number): number {
    if (burnRate <= 0) return 0
    return burnRate * 60 * this.COST_PER_TOKEN
  }
  
  private determineWarningLevel(usagePercent: number, remainingMinutes: number): 'normal' | 'warning' | 'danger' {
    // 使用率ベース
    let usageLevel: 'normal' | 'warning' | 'danger' = 'normal'
    if (usagePercent >= 90) {
      usageLevel = 'danger'
    } else if (usagePercent >= 70) {
      usageLevel = 'warning'
    }
    
    // 時間ベース
    let timeLevel: 'normal' | 'warning' | 'danger' = 'normal'
    if (remainingMinutes < 30) {
      timeLevel = 'danger'
    } else if (remainingMinutes <= 60) {
      timeLevel = 'warning'
    }
    
    // より厳しい方を採用
    if (usageLevel === 'danger' || timeLevel === 'danger') return 'danger'
    if (usageLevel === 'warning' || timeLevel === 'warning') return 'warning'
    return 'normal'
  }
  
  private getDefaultProcessedData(tokenLimit: number): ProcessedData {
    return {
      isActive: false,
      totalTokens: 0,
      costUSD: 0,
      remainingMinutes: 0,
      remainingSeconds: 0,
      usagePercent: 0,
      tokensRemaining: tokenLimit,
      blockProgress: 0,
      burnRate: 0,
      costPerHour: 0,
      warningLevel: 'normal'
    }
  }
}
```

## テスト方針

1. **正常系**
   - アクティブブロックの処理
   - 非アクティブブロックの処理
   - オプションフィールドありの処理

2. **異常系**
   - null入力の処理
   - 負の値の処理
   - 不正な値（NaN, Infinity）の処理

3. **境界値**
   - 使用率: 0%, 70%, 90%, 100%, 100%超
   - 残り時間: 0分, 30分, 60分, 300分
   - トークン数: 0, tokenLimit, tokenLimit超

4. **警告レベル判定**
   - 各種組み合わせのテスト

## パフォーマンス考慮事項

1. 計算処理は軽量で、複雑な処理は避ける
2. 小数点の丸め処理は最小限に
3. 不要な中間変数の作成を避ける

## 今後の拡張性

1. トークン単価の動的設定
2. ブロック時間の動的設定（5時間以外の対応）
3. より詳細な警告レベル（5段階など）
4. 予測機能の追加（現在のペースでの終了時刻など）