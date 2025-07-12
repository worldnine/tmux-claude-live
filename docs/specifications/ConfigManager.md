# ConfigManager クラス仕様書

## 概要

ConfigManagerは、tmux-claude-liveの設定管理を担当するクラスです。tmux変数から設定を読み込み、デフォルト値とマージして、検証済みの設定オブジェクトを提供します。

## 責務

1. tmux変数からの設定読み込み
2. デフォルト設定の管理
3. 設定値の検証と正規化
4. 無効な設定値の処理

## クラス構造

```typescript
export class ConfigManager {
  loadConfig(): Config
  getDefault(): Config
  validateConfig(config: Config): boolean
}
```

## 詳細仕様

### loadConfig(): Config

#### 概要
tmux変数から設定を読み込み、デフォルト値とマージして返します。

#### 処理フロー
1. デフォルト設定を取得
2. tmux変数から各設定値を読み込み
3. 読み込んだ値を検証
4. 有効な値のみデフォルト設定を上書き
5. 完成した設定オブジェクトを返却

#### 引数
なし

#### 戻り値
- `Config`: 検証済みの設定オブジェクト

#### tmux変数マッピング

| tmux変数 | Config フィールド | デフォルト値 |
|----------|------------------|-------------|
| `@ccusage_update_interval` | `updateInterval` | 5 |
| `@ccusage_token_limit` | `tokenLimit` | 140000 |
| `@ccusage_warning_threshold_1` | `warningThresholds.usage[0]` | 70 |
| `@ccusage_warning_threshold_2` | `warningThresholds.usage[1]` | 90 |
| `@ccusage_time_warning_1` | `warningThresholds.time[0]` | 60 |
| `@ccusage_time_warning_2` | `warningThresholds.time[1]` | 30 |
| `@ccusage_time_format` | `displayFormats.time` | 'compact' |
| `@ccusage_cost_format` | `displayFormats.cost` | 'currency' |
| `@ccusage_token_format` | `displayFormats.token` | 'compact' |

### getDefault(): Config

#### 概要
デフォルト設定を返します。

#### 処理フロー
1. 定義済みのデフォルト設定オブジェクトを返却

#### 引数
なし

#### 戻り値
- `Config`: デフォルト設定オブジェクト

### validateConfig(config: Config): boolean

#### 概要
設定オブジェクトの妥当性を検証します。

#### 処理フロー
1. 各フィールドの型チェック
2. 数値の範囲チェック
3. 列挙値の妥当性チェック
4. すべて有効な場合はtrue、いずれか無効な場合はfalseを返却

#### 引数
- `config`: 検証対象の設定オブジェクト

#### 戻り値
- `boolean`: 検証結果（true: 有効、false: 無効）

#### 検証ルール

1. **updateInterval**
   - 1以上の整数
   - 最大値は3600（1時間）

2. **tokenLimit**
   - 1000以上の整数
   - 最大値は10000000（1000万）

3. **warningThresholds.usage**
   - 2要素の配列
   - 各要素は0-100の数値
   - 1番目 < 2番目

4. **warningThresholds.time**
   - 2要素の配列
   - 各要素は0以上の数値
   - 1番目 > 2番目

5. **displayFormats.time**
   - 'compact' | 'verbose' | 'short' のいずれか

6. **displayFormats.cost**
   - 'currency' | 'number' | 'compact' のいずれか

7. **displayFormats.token**
   - 'compact' | 'full' | 'short' のいずれか

## データ型定義

### Config型

```typescript
export interface Config {
  updateInterval: number              // 更新間隔（秒）
  tokenLimit: number                  // トークン制限数
  warningThresholds: {
    usage: [number, number]          // 使用率警告しきい値 [warning%, danger%]
    time: [number, number]           // 時間警告しきい値 [warning分, danger分]
  }
  displayFormats: {
    time: 'compact' | 'verbose' | 'short'      // 時間表示形式
    cost: 'currency' | 'number' | 'compact'    // コスト表示形式
    token: 'compact' | 'full' | 'short'        // トークン表示形式
  }
}
```

## 実装例

```typescript
import { execSync } from 'child_process'

export class ConfigManager {
  private readonly DEFAULT_CONFIG: Config = {
    updateInterval: 5,
    tokenLimit: 140000,
    warningThresholds: {
      usage: [70, 90],
      time: [60, 30]
    },
    displayFormats: {
      time: 'compact',
      cost: 'currency',
      token: 'compact'
    }
  }

  loadConfig(): Config {
    const config = { ...this.DEFAULT_CONFIG }
    
    // 更新間隔
    const updateInterval = this.getTmuxOption('@ccusage_update_interval')
    if (updateInterval !== null) {
      const value = parseInt(updateInterval)
      if (!isNaN(value) && value > 0 && value <= 3600) {
        config.updateInterval = value
      }
    }
    
    // トークン制限
    const tokenLimit = this.getTmuxOption('@ccusage_token_limit')
    if (tokenLimit !== null) {
      const value = parseInt(tokenLimit)
      if (!isNaN(value) && value >= 1000) {
        config.tokenLimit = value
      }
    }
    
    // 警告しきい値
    const warningThreshold1 = this.getTmuxOption('@ccusage_warning_threshold_1')
    const warningThreshold2 = this.getTmuxOption('@ccusage_warning_threshold_2')
    if (warningThreshold1 !== null && warningThreshold2 !== null) {
      const v1 = parseInt(warningThreshold1)
      const v2 = parseInt(warningThreshold2)
      if (!isNaN(v1) && !isNaN(v2) && v1 >= 0 && v1 <= 100 && v2 >= 0 && v2 <= 100 && v1 < v2) {
        config.warningThresholds.usage = [v1, v2]
      }
    }
    
    // 時間警告しきい値
    const timeWarning1 = this.getTmuxOption('@ccusage_time_warning_1')
    const timeWarning2 = this.getTmuxOption('@ccusage_time_warning_2')
    if (timeWarning1 !== null && timeWarning2 !== null) {
      const v1 = parseInt(timeWarning1)
      const v2 = parseInt(timeWarning2)
      if (!isNaN(v1) && !isNaN(v2) && v1 >= 0 && v2 >= 0 && v1 > v2) {
        config.warningThresholds.time = [v1, v2]
      }
    }
    
    // 表示形式
    const timeFormat = this.getTmuxOption('@ccusage_time_format')
    if (timeFormat && this.isValidTimeFormat(timeFormat)) {
      config.displayFormats.time = timeFormat
    }
    
    const costFormat = this.getTmuxOption('@ccusage_cost_format')
    if (costFormat && this.isValidCostFormat(costFormat)) {
      config.displayFormats.cost = costFormat
    }
    
    const tokenFormat = this.getTmuxOption('@ccusage_token_format')
    if (tokenFormat && this.isValidTokenFormat(tokenFormat)) {
      config.displayFormats.token = tokenFormat
    }
    
    return config
  }
  
  getDefault(): Config {
    return { ...this.DEFAULT_CONFIG }
  }
  
  validateConfig(config: Config): boolean {
    // 基本的な型チェック
    if (typeof config.updateInterval !== 'number' || config.updateInterval < 1) {
      return false
    }
    
    if (typeof config.tokenLimit !== 'number' || config.tokenLimit < 1000) {
      return false
    }
    
    // 警告しきい値チェック
    if (!Array.isArray(config.warningThresholds.usage) || 
        config.warningThresholds.usage.length !== 2) {
      return false
    }
    
    if (!Array.isArray(config.warningThresholds.time) || 
        config.warningThresholds.time.length !== 2) {
      return false
    }
    
    // 表示形式チェック
    if (!this.isValidTimeFormat(config.displayFormats.time)) {
      return false
    }
    
    if (!this.isValidCostFormat(config.displayFormats.cost)) {
      return false
    }
    
    if (!this.isValidTokenFormat(config.displayFormats.token)) {
      return false
    }
    
    return true
  }
  
  private getTmuxOption(option: string): string | null {
    try {
      const result = execSync(`tmux show-option -gqv "${option}"`, { 
        encoding: 'utf8' 
      }).trim()
      return result || null
    } catch (error) {
      return null
    }
  }
  
  private isValidTimeFormat(format: string): format is 'compact' | 'verbose' | 'short' {
    return ['compact', 'verbose', 'short'].includes(format)
  }
  
  private isValidCostFormat(format: string): format is 'currency' | 'number' | 'compact' {
    return ['currency', 'number', 'compact'].includes(format)
  }
  
  private isValidTokenFormat(format: string): format is 'compact' | 'full' | 'short' {
    return ['compact', 'full', 'short'].includes(format)
  }
}
```

## tmuxでの設定例

```bash
# ~/.tmux.conf

# 更新間隔を10秒に設定
set -g @ccusage_update_interval 10

# トークン制限を10万に設定
set -g @ccusage_token_limit 100000

# 警告しきい値を60%と80%に設定
set -g @ccusage_warning_threshold_1 60
set -g @ccusage_warning_threshold_2 80

# 時間警告を90分と45分に設定
set -g @ccusage_time_warning_1 90
set -g @ccusage_time_warning_2 45

# 表示形式の設定
set -g @ccusage_time_format "verbose"
set -g @ccusage_cost_format "number"
set -g @ccusage_token_format "full"
```

## エラーハンドリング

### tmux変数が存在しない場合
- エラーをキャッチして`null`を返す
- デフォルト値を使用

### 無効な値が設定されている場合
- 検証に失敗した値は無視
- デフォルト値を使用

### tmuxコマンドが失敗した場合
- エラーをキャッチして`null`を返す
- デフォルト設定を使用

## パフォーマンス考慮事項

1. tmux変数の読み込みは起動時に1回のみ
2. execSyncの呼び出しを最小限に
3. 設定のキャッシュを検討（将来的な拡張）

## テスト方針

1. **デフォルト設定の読み込み**
2. **カスタム設定の読み込み**
3. **無効な値の処理**
4. **エラーハンドリング**
5. **設定の検証**

## 今後の拡張性

1. 設定ファイル（JSON/YAML）からの読み込み
2. 環境変数からの読み込み
3. 動的な設定変更への対応
4. 設定のエクスポート機能