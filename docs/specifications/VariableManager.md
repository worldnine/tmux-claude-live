# VariableManager クラス仕様書

## 概要

VariableManagerは、tmuxの変数システムを管理するクラスです。ProcessedDataから生成されたデータをtmux変数として設定し、tmux.confから参照できるようにします。

## 責務

1. tmux変数の設定・取得・削除
2. 複数変数の一括操作
3. ProcessedDataからtmux変数マップの生成
4. エラーハンドリング（tmuxコマンド失敗時の処理）
5. 変数の存在確認

## 設計コンセプト

### tmux変数名の命名規則
- プレフィックス: `@ccusage_`
- 区切り文字: `_`（アンダースコア）
- 例: `@ccusage_total_tokens`, `@ccusage_warning_color`

### 変数の種類
1. **基本データ**: APIから直接取得された値
2. **計算データ**: 処理されて算出された値
3. **フォーマット済みデータ**: 表示用に整形された値
4. **メタデータ**: 色情報やレベル情報

## クラス構造

```typescript
export class VariableManager {
  setVariable(name: string, value: string): void
  getVariable(name: string): string | null
  removeVariable(name: string): void
  setBulkVariables(variables: Record<string, string>): void
  getAllVariables(): Record<string, string>
  clearAllVariables(): void
  variableExists(name: string): boolean
  generateVariableMap(data: ProcessedData, config: Config): Record<string, string>
}
```

## 詳細仕様

### setVariable(name: string, value: string): void

#### 概要
単一のtmux変数を設定します。

#### 引数
- `name`: 変数名（`@ccusage_`プレフィックスなし）
- `value`: 変数の値

#### 処理
1. `tmux set-option -g @${name} "${value}"` を実行
2. 特殊文字のエスケープ処理
3. エラー時はサイレントに失敗

#### 実行例
```bash
tmux set-option -g @ccusage_total_tokens "12500"
```

### getVariable(name: string): string | null

#### 概要
単一のtmux変数を取得します。

#### 引数
- `name`: 変数名（`@ccusage_`プレフィックスなし）

#### 戻り値
- `string`: 変数の値（空白文字をトリム）
- `null`: 変数が存在しない場合、またはエラー時

#### 処理
1. `tmux show-option -gqv @${name}` を実行
2. 出力の空白文字をトリム
3. 空文字列の場合は `null` を返す

### removeVariable(name: string): void

#### 概要
単一のtmux変数を削除します。

#### 引数
- `name`: 変数名（`@ccusage_`プレフィックスなし）

#### 処理
1. `tmux set-option -gu @${name}` を実行
2. エラー時はサイレントに失敗

#### 実行例
```bash
tmux set-option -gu @ccusage_total_tokens
```

### setBulkVariables(variables: Record<string, string>): void

#### 概要
複数のtmux変数を一括で設定します。パフォーマンス向上のため、単一のtmuxコマンドで実行されます。

#### 引数
- `variables`: 変数名と値のオブジェクト

#### 処理
1. 空のオブジェクトの場合は何もしない
2. 各変数について `set-option -g @${name} "${value}"` を生成
3. セミコロンで連結して単一コマンドとして実行

#### 実行例
```bash
tmux set-option -g @ccusage_total_tokens "12500"; set-option -g @ccusage_cost_current "$1.85"; set-option -g @ccusage_time_remaining "2h15m"
```

### getAllVariables(): Record<string, string>

#### 概要
`@ccusage_`プレフィックスを持つ全ての変数を取得します。

#### 戻り値
- `Record<string, string>`: 変数名（プレフィックスなし）と値のオブジェクト

#### 処理
1. `tmux show-options -g` を実行
2. 出力から `@ccusage_` プレフィックスを持つ行を抽出
3. 各行を解析して変数名と値を取得
4. プレフィックスを除去した形で返す

#### 出力例
```typescript
{
  'total_tokens': '12500',
  'cost_current': '$1.85',
  'time_remaining': '2h15m'
}
```

### clearAllVariables(): void

#### 概要
`@ccusage_`プレフィックスを持つ全ての変数を削除します。

#### 処理
1. `getAllVariables()` で現在の変数を取得
2. 各変数について `set-option -gu @${name}` を生成
3. セミコロンで連結して単一コマンドとして実行

### variableExists(name: string): boolean

#### 概要
指定した変数が存在するかを確認します。

#### 引数
- `name`: 変数名（`@ccusage_`プレフィックスなし）

#### 戻り値
- `boolean`: 存在する場合は`true`、存在しない場合またはエラー時は`false`

#### 処理
1. `getVariable(name)` を実行
2. 結果が `null` でない場合は `true`

### generateVariableMap(data: ProcessedData, config: Config): Record<string, string>

#### 概要
ProcessedDataとConfigから、tmux変数のマップを生成します。これがこのクラスの最も重要な機能です。

#### 引数
- `data`: DataProcessorから出力された処理済みデータ
- `config`: 表示設定

#### 戻り値
- `Record<string, string>`: 変数名（プレフィックスなし）と値のオブジェクト

#### 生成される変数

| 変数名 | 型 | 説明 | 例 |
|--------|-----|------|-----|
| `is_active` | string | アクティブ状態 | `'true'` |
| `total_tokens` | string | 総トークン数 | `'12500'` |
| `total_tokens_formatted` | string | フォーマット済み総トークン数 | `'12.5k'` |
| `cost_current` | string | 現在のコスト | `'$1.85'` |
| `time_remaining` | string | 残り時間 | `'2h15m'` |
| `usage_percent` | string | 使用率 | `'8.93%'` |
| `tokens_remaining` | string | 残りトークン数 | `'127500'` |
| `tokens_remaining_formatted` | string | フォーマット済み残りトークン数 | `'127.5k'` |
| `warning_level` | string | 警告レベル | `'normal'` |
| `warning_color` | string | 警告色 | `'colour2'` |
| `warning_color_name` | string | 警告色名 | `'green'` |
| `burn_rate` | string | 消費率 | `'250'` |
| `burn_rate_formatted` | string | フォーマット済み消費率 | `'250/min'` |
| `cost_per_hour` | string | 時間あたりコスト | `'$0.90'` |
| `token_limit` | string | トークン制限 | `'140000'` |
| `token_limit_formatted` | string | フォーマット済みトークン制限 | `'140k'` |
| `block_progress` | string | ブロック進捗 | `'55'` |
| `block_progress_percent` | string | ブロック進捗率 | `'55%'` |
| `remaining_seconds` | string | 残り秒数 | `'8100'` |

#### 処理ロジック

1. **基本データの設定**
   ```typescript
   'is_active': data.isActive.toString(),
   'total_tokens': data.totalTokens.toString(),
   'cost_current': CostFormatter.format(data.costUSD, config.displayFormats.cost),
   'time_remaining': TimeFormatter.format(data.remainingMinutes, config.displayFormats.time),
   ```

2. **計算データの設定**
   ```typescript
   'usage_percent': `${data.usagePercent.toFixed(2)}%`,
   'tokens_remaining': data.tokensRemaining.toString(),
   'burn_rate': data.burnRate.toString(),
   'cost_per_hour': CostFormatter.format(data.costPerHour, config.displayFormats.cost),
   ```

3. **フォーマット済みデータの設定**
   ```typescript
   'total_tokens_formatted': TokenFormatter.format(data.totalTokens, config.displayFormats.token),
   'tokens_remaining_formatted': TokenFormatter.format(data.tokensRemaining, config.displayFormats.token),
   'token_limit_formatted': TokenFormatter.format(config.tokenLimit, config.displayFormats.token),
   ```

4. **メタデータの設定**
   ```typescript
   'warning_level': data.warningLevel,
   'warning_color': ColorResolver.resolveColorFromProcessedData(data),
   'warning_color_name': ColorResolver.getColorName(ColorResolver.resolveColorFromProcessedData(data)),
   ```

5. **非アクティブ状態の処理**
   ```typescript
   if (!data.isActive) {
     // 基本的な値は0またはデフォルト値
     // 警告色は'colour8'（グレー）
     // 警告色名は'grey'
   }
   ```

## エラーハンドリング

### tmuxコマンドのエラー処理

```typescript
try {
  execSync(`tmux set-option -g @${name} "${value}"`, { encoding: 'utf8' })
} catch (error) {
  // サイレントに失敗 - ログ出力やデバッグ用処理は行うが、例外は投げない
  console.error(`Failed to set tmux variable: ${name}`, error)
}
```

### 境界値・異常値の処理

- 空文字列の値 → そのまま設定
- `null`/`undefined` → 空文字列として設定
- 特殊文字 → エスケープ処理

## パフォーマンス考慮事項

### 一括操作の活用
- 複数変数の設定は `setBulkVariables()` を使用
- 単一のtmuxコマンドで実行することで効率化

### 不要な操作の回避
- 変数の値に変更がない場合でも設定を実行（差分検出は行わない）
- tmuxの内部キャッシュに依存

## 使用例

### 基本的な使用方法

```typescript
const variableManager = new VariableManager()

// 単一変数の設定
variableManager.setVariable('total_tokens', '12500')

// 複数変数の一括設定
const variables = {
  'total_tokens': '12500',
  'cost_current': '$1.85',
  'time_remaining': '2h15m'
}
variableManager.setBulkVariables(variables)

// 変数の取得
const totalTokens = variableManager.getVariable('total_tokens')
```

### ProcessedDataからの変数生成

```typescript
const variableManager = new VariableManager()
const processedData = await dataProcessor.processData(blockData)
const config = configManager.loadConfig()

// 変数マップの生成
const variableMap = variableManager.generateVariableMap(processedData, config)

// 一括設定
variableManager.setBulkVariables(variableMap)
```

## tmux.confでの使用例

```bash
# 基本的な表示
set -g status-right "#{@ccusage_total_tokens_formatted} | #{@ccusage_time_remaining}"

# 警告色付きの表示
set -g status-right "#[fg=#{@ccusage_warning_color}]#{@ccusage_total_tokens_formatted}#[default] | #{@ccusage_time_remaining}"

# 詳細な表示
set -g status-right "#[fg=#{@ccusage_warning_color}]Claude: #{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} (#{@ccusage_usage_percent}) | #{@ccusage_burn_rate_formatted} | #{@ccusage_time_remaining} | #{@ccusage_cost_current}#[default]"
```

## テスト方針

### 単体テスト
1. **基本操作のテスト**
   - `setVariable`, `getVariable`, `removeVariable`
   - エラーハンドリング

2. **一括操作のテスト**
   - `setBulkVariables`, `getAllVariables`, `clearAllVariables`
   - 空オブジェクトの処理

3. **変数マップ生成のテスト**
   - `generateVariableMap`
   - アクティブ/非アクティブ状態
   - 各フォーマット設定での動作確認

### 統合テスト
1. **tmux実環境でのテスト**
   - 実際のtmuxコマンドの実行
   - 変数の実際の設定・取得

2. **エラー状況のテスト**
   - tmuxが利用できない環境
   - 権限エラー

## セキュリティ考慮事項

### コマンドインジェクション対策
- 変数名・値の適切なエスケープ
- 特殊文字の処理
- 信頼できない入力の検証

### 権限制御
- tmux セッションへの適切なアクセス制御
- グローバル変数の使用制限

## 拡張性

### 将来的な機能拡張
1. **キャッシュ機能**
   - 変数の差分検出
   - 無駄な更新の回避

2. **バリデーション機能**
   - 変数値の妥当性チェック
   - 型安全性の向上

3. **設定の永続化**
   - tmux設定ファイルへの自動書き込み
   - 設定の復元機能

このVariableManagerにより、ProcessedDataがtmux変数として適切に管理され、柔軟なtmux.conf設定が可能になります。