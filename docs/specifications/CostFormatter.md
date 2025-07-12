# CostFormatter クラス仕様書

## 概要

CostFormatterは、Claude Codeの使用コストを様々な形式で表示するためのフォーマッタークラスです。通貨形式、数値形式、コンパクト形式での表示をサポートし、tmux変数システムに適したコスト情報の表示を提供します。

## 責務

1. コストの表示形式変換（currency, number, compact）
2. 精度指定でのコスト表示
3. コスト文字列の解析とパース
4. 時間あたりコストの表示
5. コスト範囲の表示
6. コストレベルの判定
7. 節約額の表示

## クラス構造

```typescript
export class CostFormatter {
  static format(cost: number, format?: CostFormat): string
  static formatWithPrecision(cost: number, precision: number): string
  static parseCostString(costString: string): number
  static formatPerHour(costPerHour: number, format?: CostFormat): string
  static formatRange(minCost: number, maxCost: number, format?: CostFormat): string
  static getCostLevel(cost: number): CostLevel
  static formatSavings(savings: number): string
}
```

## 詳細仕様

### format(cost: number, format?: CostFormat): string

#### 概要
指定された形式でコストを表示用文字列に変換します。

#### 引数
- `cost`: コスト金額（USD）
- `format`: 表示形式（デフォルト: 'currency'）

#### 戻り値
- `string`: フォーマットされたコスト文字列

#### 表示形式

1. **currency形式**（デフォルト）
   - 例: `$1.85`, `$0.00`, `$999.99`
   - USD通貨記号付き
   - 小数点以下2桁固定

2. **number形式**
   - 例: `1.85`, `0.00`, `999.99`
   - 通貨記号なし
   - 小数点以下2桁固定

3. **compact形式**
   - 例: `1.85$`, `0$`, `999.99$`
   - 末尾に通貨記号
   - 整数の場合は小数点なし
   - 小数の場合は有効桁のみ表示

#### 処理ルール
- 負の値は0として扱う
- 小数点以下は四捨五入
- 0.001未満は0.00として表示

### formatWithPrecision(cost: number, precision: number): string

#### 概要
指定された精度でコストを表示します。

#### 引数
- `cost`: コスト金額（USD）
- `precision`: 小数点以下の桁数（0-4）

#### 戻り値
- `string`: 精度指定でフォーマットされたコスト文字列

#### 例
```typescript
formatWithPrecision(1.23456, 0) // "$1"
formatWithPrecision(1.23456, 2) // "$1.23"
formatWithPrecision(1.23456, 4) // "$1.2346"
```

### parseCostString(costString: string): number

#### 概要
コスト文字列を数値に変換します。

#### 引数
- `costString`: コスト文字列（例: "$1.85", "1.85$", "1.85"）

#### 戻り値
- `number`: 解析されたコスト金額

#### 対応形式
- `$1.85` (currency形式)
- `1.85$` (compact形式)
- `1.85` (number形式)
- 無効な文字列の場合は0を返却

### formatPerHour(costPerHour: number, format?: CostFormat): string

#### 概要
時間あたりのコストを表示します。

#### 引数
- `costPerHour`: 1時間あたりのコスト
- `format`: 表示形式（デフォルト: 'currency'）

#### 戻り値
- `string`: 時間あたりコスト文字列

#### 例
```typescript
formatPerHour(2.5) // "$2.50/h"
formatPerHour(2.5, 'number') // "2.50/h"
formatPerHour(2.5, 'compact') // "2.50$/h"
```

### formatRange(minCost: number, maxCost: number, format?: CostFormat): string

#### 概要
コストの範囲を表示します。

#### 引数
- `minCost`: 最小コスト
- `maxCost`: 最大コスト
- `format`: 表示形式（デフォルト: 'currency'）

#### 戻り値
- `string`: コスト範囲文字列

#### 例
```typescript
formatRange(1.50, 2.50) // "$1.50-$2.50"
formatRange(1.85, 1.85) // "$1.85" (同じ値の場合)
formatRange(1.50, 2.50, 'number') // "1.50-2.50"
```

### getCostLevel(cost: number): CostLevel

#### 概要
コスト金額に基づいてレベルを判定します。

#### 引数
- `cost`: コスト金額

#### 戻り値
- `CostLevel`: コストレベル

#### レベル判定基準
- `free`: $0.00
- `low`: $0.01 - $2.00
- `medium`: $2.01 - $10.00
- `high`: $10.01 - $30.00
- `very-high`: $30.01以上

### formatSavings(savings: number): string

#### 概要
節約額または追加コストを表示します。

#### 引数
- `savings`: 節約額（正の値=節約、負の値=追加コスト）

#### 戻り値
- `string`: 節約額表示文字列

#### 例
```typescript
formatSavings(2.50) // "Save $2.50"
formatSavings(0) // "No savings"
formatSavings(-1.50) // "Additional $1.50"
```

## データ型定義

### CostFormat型

```typescript
export type CostFormat = 'currency' | 'number' | 'compact'
```

### CostLevel型

```typescript
export type CostLevel = 'free' | 'low' | 'medium' | 'high' | 'very-high'
```

## 実装例

```typescript
export class CostFormatter {
  static format(cost: number, format: CostFormat = 'currency'): string {
    const normalizedCost = Math.max(0, cost)
    
    switch (format) {
      case 'currency':
        return this.formatCurrency(normalizedCost)
      case 'number':
        return this.formatNumber(normalizedCost)
      case 'compact':
        return this.formatCompact(normalizedCost)
      default:
        return this.formatCurrency(normalizedCost)
    }
  }

  static formatWithPrecision(cost: number, precision: number): string {
    const normalizedCost = Math.max(0, cost)
    const validPrecision = Math.max(0, Math.min(4, Math.floor(precision)))
    return `$${normalizedCost.toFixed(validPrecision)}`
  }

  static parseCostString(costString: string): number {
    try {
      if (!costString || costString.trim() === '') return 0
      
      // $記号と末尾の$を除去
      const cleanString = costString.replace(/[$]/g, '').trim()
      const num = parseFloat(cleanString)
      
      return isNaN(num) ? 0 : Math.max(0, num)
    } catch (error) {
      return 0
    }
  }

  static formatPerHour(costPerHour: number, format: CostFormat = 'currency'): string {
    const formattedCost = this.format(costPerHour, format)
    const baseCost = format === 'compact' ? formattedCost : formattedCost
    return `${baseCost}/h`
  }

  static formatRange(minCost: number, maxCost: number, format: CostFormat = 'currency'): string {
    const min = this.format(minCost, format)
    const max = this.format(maxCost, format)
    
    return minCost === maxCost ? min : `${min}-${max}`
  }

  static getCostLevel(cost: number): CostLevel {
    if (cost <= 0) return 'free'
    if (cost <= 2) return 'low'
    if (cost <= 10) return 'medium'
    if (cost <= 30) return 'high'
    return 'very-high'
  }

  static formatSavings(savings: number): string {
    if (savings === 0) return 'No savings'
    if (savings > 0) return `Save ${this.format(savings, 'currency')}`
    return `Additional ${this.format(Math.abs(savings), 'currency')}`
  }

  private static formatCurrency(cost: number): string {
    return `$${cost.toFixed(2)}`
  }

  private static formatNumber(cost: number): string {
    return cost.toFixed(2)
  }

  private static formatCompact(cost: number): string {
    if (cost === 0) return '0$'
    
    // 整数の場合は小数点なし
    if (cost % 1 === 0) {
      return `${Math.floor(cost)}$`
    }
    
    // 小数の場合は有効桁数のみ
    return `${cost.toFixed(2).replace(/\.?0+$/, '')}$`
  }
}
```

## tmux統合での使用例

```bash
# ~/.tmux.conf

# シンプルなコスト表示
set -g status-right "Cost: #{@ccusage_cost_current}"

# 詳細なコスト情報
set -g status-right "#{@ccusage_cost_current} (#{@ccusage_cost_per_hour}/h)"

# コストレベルに応じた色分け
set -g status-right "#[fg=#{@ccusage_cost_color}]#{@ccusage_cost_current}#[default]"
```

## エラーハンドリング

### 入力値の検証
- 負の値: 0として処理
- NaN/Infinity: 0として処理
- null/undefined: 0として処理

### 精度の制限
- 精度は0-4桁に制限
- 範囲外の値は自動調整

### 文字列解析のエラー
- 不正な形式: 0を返却
- 空文字列: 0を返却
- 解析失敗: 0を返却

## パフォーマンス考慮事項

1. 文字列操作の最適化
2. 正規表現の使用を最小限に
3. 数値計算の効率化
4. キャッシュ不要（軽量な処理）

## テスト方針

1. **基本的なフォーマット**
   - 各形式での表示確認
   - 境界値テスト

2. **精度指定**
   - 各精度での動作確認
   - 丸め処理の確認

3. **文字列解析**
   - 各形式の正常解析
   - エラーケースの処理

4. **ユーティリティ機能**
   - 時間あたりコスト
   - 範囲表示
   - コストレベル判定

## 拡張性

1. 通貨の国際化対応
2. カスタム通貨記号のサポート
3. より詳細なコストレベル
4. 動的な精度設定

このCostFormatterにより、tmux-claude-liveでのコスト情報が直感的で柔軟な形式で表示できるようになります。