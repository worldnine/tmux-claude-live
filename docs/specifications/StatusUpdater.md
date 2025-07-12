# StatusUpdater クラス仕様書

## 概要

StatusUpdaterは、tmux-claude-liveシステムの中核となるクラスで、ccusage APIからのデータ取得、処理、tmux変数への反映を統合的に管理します。定期的な更新、一回限りの更新、デーモンとしての動作を提供します。

## 責務

1. **データ取得・処理・反映の統合管理**
   - CcusageClient → DataProcessor → VariableManager の連携
   - エラーハンドリングの統一

2. **定期更新システム**
   - 設定可能な間隔での自動更新
   - デーモンプロセスとしての動作

3. **状態管理**
   - 更新回数の記録
   - 最終更新時刻の記録
   - 動作状態の監視

4. **コマンドライン統合**
   - 一回限りの更新コマンド
   - デーモンの開始・停止

## 設計コンセプト

### アーキテクチャ
```
StatusUpdater
├── CcusageClient (データ取得)
├── DataProcessor (データ処理)
├── VariableManager (tmux変数管理)
└── ConfigManager (設定管理)
```

### 動作モード
1. **ワンショット**: 一回限りの更新
2. **デーモン**: 定期的な更新
3. **クリーンアップ**: 変数の削除

### エラーハンドリング
- 各段階でのエラーを適切に処理
- 部分的な失敗でもシステム全体は継続
- ログ出力による監視

## クラス構造

```typescript
export class StatusUpdater {
  // 基本操作
  updateOnce(): Promise<void>
  updateAll(): Promise<void>
  clearAllVariables(): void
  
  // デーモン操作
  startDaemon(interval?: number): NodeJS.Timeout
  stopDaemon(): void
  isDaemonRunning(): boolean
  
  // 状態取得
  getStatus(): StatusInfo
  getLastUpdateTime(): number | null
  getUpdateCount(): number
}
```

## 詳細仕様

### updateOnce(): Promise<void>

#### 概要
一回限りの更新処理を実行します。システムの基本動作単位です。

#### 処理フロー
1. ConfigManagerから設定を読み込み
2. CcusageClientでブロック情報を取得
3. DataProcessorでデータを処理
4. VariableManagerで変数を生成・設定
5. 更新統計を記録

#### エラーハンドリング
- ccusage APIが失敗した場合 → 非アクティブ状態として処理
- データ処理が失敗した場合 → デフォルト値で処理
- 変数設定が失敗した場合 → ログ出力して継続

#### 実装例
```typescript
async updateOnce(): Promise<void> {
  try {
    this.updateCount++
    
    const config = ConfigManager.loadConfig()
    const blockData = await this.ccusageClient.getActiveBlock()
    
    if (!blockData) {
      // 非アクティブ状態として処理
      const inactiveData = this.dataProcessor.processInactiveState(config)
      const variableMap = this.variableManager.generateVariableMap(inactiveData, config)
      this.variableManager.setBulkVariables(variableMap)
    } else {
      // 通常の処理
      const processedData = this.dataProcessor.processData(blockData, config)
      const variableMap = this.variableManager.generateVariableMap(processedData, config)
      this.variableManager.setBulkVariables(variableMap)
    }
    
    this.lastUpdateTime = Date.now()
  } catch (error) {
    console.error('Update failed:', error)
    // エラーでも統計は更新
    this.lastUpdateTime = Date.now()
  }
}
```

### updateAll(): Promise<void>

#### 概要
`updateOnce()`のエイリアス。将来的な拡張性を考慮した命名。

#### 処理
`updateOnce()`と同じ処理を実行します。

### startDaemon(interval?: number): NodeJS.Timeout

#### 概要
定期的な更新デーモンを開始します。

#### 引数
- `interval`: 更新間隔（ミリ秒）、省略時は設定値を使用

#### 戻り値
- `NodeJS.Timeout`: 設定されたタイマーID

#### 処理ロジック
1. 既存のデーモンが動作中の場合は停止
2. 指定された間隔で`updateOnce()`を実行
3. タイマーIDを保存して状態を管理

#### 実装例
```typescript
startDaemon(interval?: number): NodeJS.Timeout {
  // 既存のデーモンを停止
  this.stopDaemon()
  
  // 間隔の決定
  const updateInterval = interval || ConfigManager.loadConfig().updateInterval * 1000
  
  // 初回実行
  this.updateOnce()
  
  // 定期実行の設定
  this.intervalId = setInterval(() => {
    this.updateOnce()
  }, updateInterval)
  
  return this.intervalId
}
```

### stopDaemon(): void

#### 概要
動作中のデーモンを停止します。

#### 処理
1. タイマーIDが存在する場合は`clearInterval()`を実行
2. タイマーIDをクリア
3. 状態を更新

### isDaemonRunning(): boolean

#### 概要
デーモンの動作状態を確認します。

#### 戻り値
- `boolean`: 動作中は`true`、停止中は`false`

#### 判定基準
内部に保存されているタイマーIDの存在によって判定します。

### clearAllVariables(): void

#### 概要
すべてのccusage関連tmux変数を削除します。

#### 使用場面
- アンインストール時
- 設定リセット時
- エラー状態からの復旧時

#### 処理
`VariableManager.clearAllVariables()`を呼び出します。

### getStatus(): StatusInfo

#### 概要
現在の状態情報を取得します。

#### 戻り値
```typescript
interface StatusInfo {
  isRunning: boolean          // デーモン動作状態
  updateCount: number         // 更新回数
  lastUpdateTime: number | null // 最終更新時刻
  interval: number            // 更新間隔（ミリ秒）
  nextUpdateTime?: number     // 次回更新予定時刻
}
```

### getLastUpdateTime(): number | null

#### 概要
最終更新時刻を取得します。

#### 戻り値
- `number`: 最終更新時刻（Unix timestamp）
- `null`: 未更新の場合

### getUpdateCount(): number

#### 概要
更新回数を取得します。

#### 戻り値
- `number`: 累計更新回数

## 状態管理

### 内部状態
```typescript
class StatusUpdater {
  private ccusageClient: CcusageClient
  private dataProcessor: DataProcessor
  private variableManager: VariableManager
  private configManager: ConfigManager
  
  private intervalId: NodeJS.Timeout | null = null
  private updateCount: number = 0
  private lastUpdateTime: number | null = null
}
```

### 状態遷移
```
初期状態 → 更新実行 → 更新完了 → 待機状態
    ↓          ↓         ↓        ↓
  停止中    実行中    完了      待機中
```

## エラーハンドリング戦略

### 段階別エラー処理

#### 1. ccusage API エラー
```typescript
// ccusage コマンドが失敗した場合
const blockData = await this.ccusageClient.getActiveBlock()
if (!blockData) {
  // 非アクティブ状態として処理を継続
  const inactiveData = this.dataProcessor.processInactiveState(config)
  // ... 処理継続
}
```

#### 2. データ処理エラー
```typescript
try {
  const processedData = this.dataProcessor.processData(blockData, config)
} catch (error) {
  // デフォルト値で処理を継続
  const processedData = this.dataProcessor.getDefaultData()
}
```

#### 3. 変数設定エラー
```typescript
try {
  this.variableManager.setBulkVariables(variableMap)
} catch (error) {
  // ログ出力して次回に期待
  console.error('Failed to set variables:', error)
}
```

### 回復戦略
- 一時的なエラーは次回更新で回復を試行
- 永続的なエラーは非アクティブ状態を表示
- 重要なエラーはログ出力で監視

## パフォーマンス考慮事項

### 更新間隔の最適化
- デフォルト: 5秒間隔
- 最小: 1秒間隔
- 最大: 60秒間隔

### 効率的な処理
- 不要な更新の回避
- 一括変数設定の活用
- 軽量なデータ処理

### メモリ管理
- 適切なタイマー管理
- 不要なデータの解放
- 循環参照の回避

## 使用例

### 基本的な使用方法

```typescript
// 一回限りの更新
const statusUpdater = new StatusUpdater()
await statusUpdater.updateOnce()

// デーモンとして動作
const intervalId = statusUpdater.startDaemon()
// ... 作業
statusUpdater.stopDaemon()
```

### コマンドライン統合

```bash
# 一回限りの更新
bun run update-once

# デーモンとして開始
bun run start-daemon

# 状態確認
bun run status

# 停止
bun run stop-daemon
```

### tmux プラグインとしての使用

```bash
# claude-live.tmux
#!/usr/bin/env bash
CURRENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# デーモンの開始
tmux run-shell "cd $CURRENT_DIR && bun run start-daemon"

# 定期的な状態確認
tmux run-shell "cd $CURRENT_DIR && bun run status"
```

## 設定可能項目

### 更新間隔
```bash
# tmux 設定
set -g @ccusage_update_interval "5"  # 5秒間隔

# 環境変数
export CCUSAGE_UPDATE_INTERVAL=5
```

### ログレベル
```bash
# 詳細ログ
export CCUSAGE_LOG_LEVEL=debug

# エラーのみ
export CCUSAGE_LOG_LEVEL=error
```

### 動作モード
```bash
# 開発モード
export CCUSAGE_MODE=development

# 本番モード
export CCUSAGE_MODE=production
```

## 統合テスト

### 基本動作テスト
```typescript
describe('StatusUpdater Integration', () => {
  test('complete update cycle', async () => {
    const statusUpdater = new StatusUpdater()
    
    // 更新実行
    await statusUpdater.updateOnce()
    
    // 結果確認
    expect(statusUpdater.getUpdateCount()).toBe(1)
    expect(statusUpdater.getLastUpdateTime()).not.toBeNull()
  })
})
```

### デーモン動作テスト
```typescript
test('daemon lifecycle', async () => {
  const statusUpdater = new StatusUpdater()
  
  // デーモン開始
  statusUpdater.startDaemon(1000)
  expect(statusUpdater.isDaemonRunning()).toBe(true)
  
  // 時間経過待機
  await new Promise(resolve => setTimeout(resolve, 2500))
  
  // 複数回更新を確認
  expect(statusUpdater.getUpdateCount()).toBeGreaterThan(1)
  
  // デーモン停止
  statusUpdater.stopDaemon()
  expect(statusUpdater.isDaemonRunning()).toBe(false)
})
```

## 監視・デバッグ

### ログ出力
```typescript
// 更新開始
console.log('Starting update:', new Date().toISOString())

// 更新完了
console.log('Update completed:', {
  updateCount: this.updateCount,
  lastUpdateTime: this.lastUpdateTime,
  duration: Date.now() - startTime
})

// エラー発生
console.error('Update failed:', error.message)
```

### 状態確認
```typescript
// 詳細状態の取得
const status = statusUpdater.getStatus()
console.log('Current status:', status)

// パフォーマンス確認
const timeSinceLastUpdate = Date.now() - statusUpdater.getLastUpdateTime()
console.log('Time since last update:', timeSinceLastUpdate)
```

### tmux変数での確認
```bash
# 更新回数の確認
tmux show-option -gv @ccusage_update_count

# 最終更新時刻の確認
tmux show-option -gv @ccusage_last_update_time

# 動作状態の確認
tmux show-option -gv @ccusage_daemon_status
```

## 拡張性

### 将来的な機能追加
1. **アダプティブ更新間隔**
   - 使用状況に応じた動的な間隔調整

2. **複数データソースの統合**
   - ccusage以外のデータソースの追加

3. **プラグインシステム**
   - カスタムフォーマッターの追加

4. **キャッシュ機能**
   - 効率的なデータ管理

### 設計原則
- 単一責任の原則
- 依存関係の注入
- 設定可能な拡張性
- 適切なエラーハンドリング

このStatusUpdaterにより、tmux-claude-liveシステムの中核機能が統合され、安定した動作が保証されます。