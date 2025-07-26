# WatchdogManager クラス仕様書

## 概要

WatchdogManagerは、tmux-claude-liveデーモンの生死監視と自動回復を担当するクラスです。「古いデータが表示される」問題を根本的に解決し、常に正しい情報が表示される状態を実現します。

## 背景と解決する問題

### 発見された問題
- デーモンが停止してもtmux変数が残存し、10日前の古いデータが表示される
- ユーザーが古いデータと気づかない
- リアルタイムモニタリングツールとしての信頼性が損なわれる

### 根本原因
1. **受動的アーキテクチャ**: tmuxが変数を受け取るだけで、データの鮮度を確認しない
2. **単一障害点**: デーモンが死ねば更新が完全に停止する
3. **監視の監視がない**: デーモンの生死を確認する仕組みが存在しない

## 設計方針

### 能動的監視システム
```
[tmuxプラグイン] ←→ [WatchdogManager] ←→ [デーモン]
        ↓                    ↓                  ↓
    [変数更新]          [生死監視]        [データ取得]
        ↓                    ↓                  ↓
    [データ表示]        [自動回復]        [正常稼働]
```

### 多層防御戦略
1. **レベル1**: デーモンの自己回復機能
2. **レベル2**: WatchdogManagerによる定期ヘルスチェック
3. **レベル3**: データ古さの自動検出と警告

## クラス仕様

### インターフェース

```typescript
export class WatchdogManager {
  // プロセス監視
  async isProcessAlive(pid: number): Promise<boolean>
  async getDaemonPid(): Promise<number | null>
  async isDaemonHealthy(): Promise<boolean>
  
  // 自動回復
  async restartDaemon(): Promise<boolean>
  async ensureDaemonRunning(): Promise<boolean>
  
  // ヘルスチェック
  async performHealthCheck(): Promise<HealthStatus>
  async getLastHealthCheck(): Promise<Date | null>
  
  // 監視制御
  startWatching(intervalMs: number): void
  stopWatching(): void
  isWatching(): boolean
}
```

### データ型定義

```typescript
export interface HealthStatus {
  isHealthy: boolean
  daemonPid: number | null
  lastUpdate: Date | null
  issues: string[]
  recoveryActions: string[]
}

export interface WatchdogConfig {
  checkIntervalMs: number        // デフォルト: 30000 (30秒)
  maxRestartAttempts: number     // デフォルト: 3
  restartCooldownMs: number      // デフォルト: 5000 (5秒)
  healthCheckTimeoutMs: number   // デフォルト: 10000 (10秒)
}
```

## 詳細仕様

### 1. プロセス監視機能

#### `isProcessAlive(pid: number): Promise<boolean>`
- **目的**: 指定されたPIDのプロセスが生きているかを確認
- **実装**: `kill -0 <pid>` コマンドを使用
- **戻り値**: プロセスが存在する場合はtrue、存在しない場合はfalse
- **エラーハンドリング**: コマンド実行エラーはfalseとして扱う

#### `getDaemonPid(): Promise<number | null>`
- **目的**: tmux変数に保存されたデーモンのPIDを取得
- **実装**: `tmux show-option -gqv @ccusage_daemon_pid` を実行
- **戻り値**: PIDが存在する場合は数値、存在しない場合はnull
- **キャッシュ**: 30秒間結果をキャッシュして負荷軽減

#### `isDaemonHealthy(): Promise<boolean>`
- **目的**: デーモンが健全に動作しているかを総合判定
- **判定基準**:
  1. PIDが取得できる
  2. プロセスが存在する
  3. 最後の更新から30秒以内である
- **戻り値**: 全ての条件を満たす場合はtrue

### 2. 自動回復機能

#### `restartDaemon(): Promise<boolean>`
- **目的**: デーモンを再起動する
- **実装手順**:
  1. 既存デーモンの停止確認
  2. ロックファイルのクリーンアップ
  3. 新しいデーモンの起動
  4. 起動確認（5秒後にプロセス存在チェック）
- **戻り値**: 再起動に成功した場合はtrue
- **リトライ**: 最大3回まで再試行

#### `ensureDaemonRunning(): Promise<boolean>`
- **目的**: デーモンが動作していることを保証
- **動作フロー**:
  ```
  HealthCheck → Unhealthy? → Restart → Success?
       ↓             ↓           ↓          ↓
     Healthy      Restart     Healthy    Failed
  ```
- **戻り値**: 最終的にデーモンが健全な場合はtrue

### 3. ヘルスチェック機能

#### `performHealthCheck(): Promise<HealthStatus>`
- **目的**: システムの総合的な健康状態を診断
- **チェック項目**:
  - デーモンプロセスの存在
  - 最後のデータ更新時刻
  - tmux変数の整合性
  - ロックファイルの状態
- **戻り値**: 詳細な健康状態レポート

### 4. 継続監視機能

#### `startWatching(intervalMs: number): void`
- **目的**: 定期的なヘルスチェックを開始
- **実装**: setIntervalを使用した定期実行
- **デフォルト間隔**: 30秒
- **自動回復**: 異常検知時は自動的にrestartDaemonを実行

## エラーハンドリング戦略

### エラー分類

1. **一時的エラー**: ネットワーク遅延、一時的なリソース不足
   - **対応**: 指数バックオフでリトライ
   
2. **設定エラー**: ccusage未インストール、権限不足
   - **対応**: エラーログ出力、ユーザーへの通知

3. **致命的エラー**: システムリソース枯渇、ファイルシステム破損
   - **対応**: フェイルセーフモードでの動作継続

### フォールバック戦略

```typescript
// デーモン復旧不可の場合のフォールバック
const fallbackData = {
  '@ccusage_daemon_status': 'recovery_failed',
  '@ccusage_error_message': 'Auto-recovery failed. Manual intervention required.',
  '@ccusage_warning_color': 'colour1'  // 赤色で警告
}
```

## パフォーマンス要件

### レスポンス時間
- プロセス存在確認: 100ms以内
- ヘルスチェック全体: 1秒以内
- デーモン再起動: 10秒以内

### リソース使用量
- メモリ使用量: 5MB以下
- CPU使用率: 0.1%以下（アイドル時）
- ディスクI/O: 最小限（ログのみ）

### 信頼性指標
- 誤検知率: 1%以下
- 復旧成功率: 95%以上
- 平均復旧時間: 30秒以内

## テスト戦略

### 単体テスト
- 各メソッドの正常系・異常系
- モックを使用したプロセス操作のシミュレーション
- エラーハンドリングの網羅的テスト

### 統合テスト
- 実際のデーモンプロセスとの連携テスト
- 異常状態の再現と自動回復の確認
- 長時間稼働での安定性テスト

### E2Eテスト
- システム全体での動作確認
- 実際のtmux環境での統合テスト
- ストレステスト（高負荷、長時間稼働）

## 実装上の注意点

### セキュリティ
- プロセス操作権限の適切な制御
- コマンドインジェクション対策
- 機密情報のログ出力防止

### 保守性
- 設定の外部化（環境変数、設定ファイル）
- 詳細なログ出力（DEBUG、INFO、WARN、ERROR）
- メトリクスの収集と監視

### 拡張性
- プラグイン機能による監視項目の追加
- 複数のヘルスチェック戦略のサポート
- カスタム回復アクションの設定

---

**この仕様書に基づいて、「古いデータは表示させない」という原則を実現するWatchdogManagerを実装します。**