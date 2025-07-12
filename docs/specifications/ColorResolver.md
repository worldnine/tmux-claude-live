# ColorResolver クラス仕様書

## 概要

ColorResolverは、Claude Code使用状況の警告レベルに基づいて適切なtmux色を決定するクラスです。使用率、残り時間、アクティブ状態などの要素を考慮して、直感的で一貫性のある色表示を提供します。

## 責務

1. 警告レベルからtmux色への変換
2. 使用率に基づく色の決定
3. 残り時間に基づく色の決定
4. 複数要素を考慮した色の決定
5. ProcessedDataからの色の決定
6. カスタム色設定のサポート
7. tmux色形式の検証

## 設計コンセプト

### 色の優先度
1. **danger** (colour1 - 赤): 最も重要な警告
2. **warning** (colour3 - 黄): 注意が必要
3. **normal** (colour2 - 緑): 正常状態
4. **inactive** (colour8 - グレー): 非アクティブ状態

### 判定基準
- **使用率ベース**: 70%未満=normal, 70-90%=warning, 90%以上=danger
- **時間ベース**: 60分超=normal, 30-60分=warning, 30分未満=danger
- **最終判定**: より厳しい方を採用

## クラス構造

```typescript
export class ColorResolver {
  static resolveWarningColor(level: 'normal' | 'warning' | 'danger'): string
  static resolveColorFromUsage(usagePercent: number): string
  static resolveColorFromTimeRemaining(remainingMinutes: number): string
  static resolveColorFromCombinedFactors(usagePercent: number, remainingMinutes: number): string
  static resolveColorFromProcessedData(data: ProcessedData): string
  static getColorName(tmuxColor: string): string
  static resolveCustomColor(level: ColorLevel, customColors?: CustomColors): string
  static isValidTmuxColor(color: string): boolean
}
```

## 詳細仕様

### resolveWarningColor(level: 'normal' | 'warning' | 'danger'): string

#### 概要
警告レベルを対応するtmux色に変換します。

#### 引数
- `level`: 警告レベル

#### 戻り値
- `string`: tmux色コード

#### マッピング
- `normal` → `colour2` (緑)
- `warning` → `colour3` (黄)
- `danger` → `colour1` (赤)
- その他 → `colour2` (デフォルト)

### resolveColorFromUsage(usagePercent: number): string

#### 概要
使用率に基づいて色を決定します。

#### 引数
- `usagePercent`: 使用率（0-100以上）

#### 戻り値
- `string`: tmux色コード

#### 判定基準
- `< 70%` → `colour2` (緑)
- `70-89%` → `colour3` (黄)
- `≥ 90%` → `colour1` (赤)

### resolveColorFromTimeRemaining(remainingMinutes: number): string

#### 概要
残り時間に基づいて色を決定します。

#### 引数
- `remainingMinutes`: 残り時間（分）

#### 戻り値
- `string`: tmux色コード

#### 判定基準
- `> 60分` → `colour2` (緑)
- `31-60分` → `colour3` (黄)
- `≤ 30分` → `colour1` (赤)

### resolveColorFromCombinedFactors(usagePercent: number, remainingMinutes: number): string

#### 概要
使用率と残り時間の両方を考慮して色を決定します。

#### 引数
- `usagePercent`: 使用率（0-100以上）
- `remainingMinutes`: 残り時間（分）

#### 戻り値
- `string`: tmux色コード

#### 判定ロジック
1. 使用率ベースの色を取得
2. 時間ベースの色を取得
3. より厳しい方（danger > warning > normal）を採用

### resolveColorFromProcessedData(data: ProcessedData): string

#### 概要
ProcessedDataから色を決定します。

#### 引数
- `data`: DataProcessorから出力された処理済みデータ

#### 戻り値
- `string`: tmux色コード

#### 判定ロジック
1. 非アクティブ状態の場合：`colour8` (グレー)
2. アクティブ状態の場合：`data.warningLevel`を使用

### getColorName(tmuxColor: string): string

#### 概要
tmux色コードから色名を取得します。

#### 引数
- `tmuxColor`: tmux色コード

#### 戻り値
- `string`: 色名

#### マッピング
- `colour1` → `red`
- `colour2` → `green`
- `colour3` → `yellow`
- `colour8` → `grey`
- その他 → `default`

### resolveCustomColor(level: ColorLevel, customColors?: CustomColors): string

#### 概要
カスタム色設定を考慮して色を決定します。

#### 引数
- `level`: 色レベル
- `customColors`: カスタム色設定（オプション）

#### 戻り値
- `string`: tmux色コード

#### 処理ロジック
1. カスタム色が設定されている場合：カスタム色を使用
2. カスタム色が未設定の場合：デフォルト色を使用

### isValidTmuxColor(color: string): boolean

#### 概要
tmux色形式の妥当性を検証します。

#### 引数
- `color`: 検証対象の色文字列

#### 戻り値
- `boolean`: 妥当性（true: 有効、false: 無効）

#### 有効な形式
- 色名: `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `black`
- 色番号: `colour0` - `colour255`
- 16進数: `#ff0000`, `#abc`

## データ型定義

### ColorLevel型

```typescript
export type ColorLevel = 'normal' | 'warning' | 'danger' | 'inactive'
```

### CustomColors型

```typescript
export interface CustomColors {
  normal?: string
  warning?: string
  danger?: string
  inactive?: string
}
```

## 実装例

```typescript
import type { ProcessedData } from '../core/DataProcessor'

export class ColorResolver {
  private static readonly DEFAULT_COLORS = {
    normal: 'colour2',   // 緑
    warning: 'colour3',  // 黄
    danger: 'colour1',   // 赤
    inactive: 'colour8'  // グレー
  }

  private static readonly COLOR_NAMES = {
    colour1: 'red',
    colour2: 'green',
    colour3: 'yellow',
    colour8: 'grey'
  }

  private static readonly VALID_COLOR_NAMES = [
    'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'black'
  ]

  static resolveWarningColor(level: 'normal' | 'warning' | 'danger'): string {
    switch (level) {
      case 'normal':
        return this.DEFAULT_COLORS.normal
      case 'warning':
        return this.DEFAULT_COLORS.warning
      case 'danger':
        return this.DEFAULT_COLORS.danger
      default:
        return this.DEFAULT_COLORS.normal
    }
  }

  static resolveColorFromUsage(usagePercent: number): string {
    if (usagePercent >= 90) {
      return this.DEFAULT_COLORS.danger
    } else if (usagePercent >= 70) {
      return this.DEFAULT_COLORS.warning
    } else {
      return this.DEFAULT_COLORS.normal
    }
  }

  static resolveColorFromTimeRemaining(remainingMinutes: number): string {
    if (remainingMinutes <= 30) {
      return this.DEFAULT_COLORS.danger
    } else if (remainingMinutes <= 60) {
      return this.DEFAULT_COLORS.warning
    } else {
      return this.DEFAULT_COLORS.normal
    }
  }

  static resolveColorFromCombinedFactors(usagePercent: number, remainingMinutes: number): string {
    const usageColor = this.resolveColorFromUsage(usagePercent)
    const timeColor = this.resolveColorFromTimeRemaining(remainingMinutes)
    
    // より厳しい方を採用
    if (usageColor === this.DEFAULT_COLORS.danger || timeColor === this.DEFAULT_COLORS.danger) {
      return this.DEFAULT_COLORS.danger
    } else if (usageColor === this.DEFAULT_COLORS.warning || timeColor === this.DEFAULT_COLORS.warning) {
      return this.DEFAULT_COLORS.warning
    } else {
      return this.DEFAULT_COLORS.normal
    }
  }

  static resolveColorFromProcessedData(data: ProcessedData): string {
    if (!data.isActive) {
      return this.DEFAULT_COLORS.inactive
    }
    
    return this.resolveWarningColor(data.warningLevel)
  }

  static getColorName(tmuxColor: string): string {
    return this.COLOR_NAMES[tmuxColor] || 'default'
  }

  static resolveCustomColor(level: ColorLevel, customColors?: CustomColors): string {
    if (customColors && customColors[level]) {
      return customColors[level]
    }
    
    return this.DEFAULT_COLORS[level] || this.DEFAULT_COLORS.normal
  }

  static isValidTmuxColor(color: string): boolean {
    if (!color || color.trim() === '') {
      return false
    }
    
    // 色名チェック
    if (this.VALID_COLOR_NAMES.includes(color)) {
      return true
    }
    
    // colour0-colour255形式チェック
    const colourMatch = color.match(/^colour(\d+)$/)
    if (colourMatch) {
      const num = parseInt(colourMatch[1])
      return num >= 0 && num <= 255
    }
    
    // 16進数カラーチェック
    const hexMatch = color.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    if (hexMatch) {
      return true
    }
    
    return false
  }
}
```

## tmux統合での使用例

```bash
# ~/.tmux.conf

# 基本的な色付き表示
set -g status-right "#[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}#[default]"

# 複数要素の色付き表示
set -g status-right "#[fg=#{@ccusage_warning_color}]Claude: #{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} | #{@ccusage_time_remaining} | #{@ccusage_cost_current}#[default]"

# アクティブ状態に応じた色分け
set -g status-right "#[fg=#{@ccusage_warning_color}]●#[default] #{@ccusage_time_remaining}"
```

## 提供されるtmux変数

- `@ccusage_warning_color`: 警告レベルに応じた色コード
- `@ccusage_warning_color_name`: 警告レベルに応じた色名

## カスタム色設定

```bash
# ~/.tmux.conf

# カスタム色の設定
set -g @ccusage_color_normal "colour10"   # 明るい緑
set -g @ccusage_color_warning "colour11"  # 明るい黄
set -g @ccusage_color_danger "colour9"    # 明るい赤
set -g @ccusage_color_inactive "colour7"  # 明るいグレー
```

## エラーハンドリング

### 不正な警告レベル
- 未知のレベル → `normal`レベルとして処理

### 無効な色コード
- 検証に失敗 → デフォルト色を使用

### 境界値の処理
- 負の値 → 適切に処理
- 極端な値 → 適切に正規化

## パフォーマンス考慮事項

1. 色の計算は軽量
2. 文字列操作を最小限に
3. 正規表現の効率的な使用
4. キャッシュ不要（状態変化に対応）

## テスト方針

1. **基本的な色解決**
   - 各警告レベルでの色確認
   - 使用率での色確認
   - 時間での色確認

2. **複合判定**
   - 複数要素の組み合わせ
   - 優先度の確認

3. **カスタム色**
   - カスタム設定の動作確認
   - フォールバック動作

4. **検証機能**
   - 有効な色形式の確認
   - 無効な色形式の処理

## 拡張性

1. より多段階の警告レベル
2. 追加の判定要素
3. アニメーション効果
4. テーマシステムの統合

このColorResolverにより、tmux-claude-liveでの状況表示が直感的で一貫性のある色分けで実現できます。