# ヘルスチェックシステム仕様書

## 概要

tmux-claude-liveの長期稼働を考慮し、デーモンプロセスの健全性を監視・自己修復するシステムを実装する。tmuxは数週間〜数ヶ月単位で稼働し続けることが前提のツールであるため、プロセスの再起動に頼らない自己修復機能が必要である。

## 背景

### 問題
- 長時間稼働（19時間以上）でburn_rate値が異常値（33537.3）を示す事象が発生
- 実際のccusage APIからは正常値（196.6）が返されていたにも関わらず、tmux変数に異常値が設定された
- デーモン再起動により問題は解決したが、tmuxの性質上、頻繁な再起動は想定されていない

### 設計方針
1. **自己診断**: 定期的に内部状態の健全性をチェック
2. **自己修復**: 異常を検出した場合、プロセスを再起動せずに内部状態をリセット
3. **透明性**: 健康状態をtmux変数として公開し、ユーザーが監視可能にする

## 機能仕様

### 1. HealthChecker クラス

異常値の検出と検証を担当するクラス。

#### 責務
- 各種メトリクスの妥当性検証
- プロセスの稼働時間チェック
- 内部状態の健全性評価

#### 主要メソッド

```typescript
interface HealthCheckResult {
  isHealthy: boolean
  status: 'healthy' | 'degraded' | 'unhealthy'
  issues: string[]
  metrics: {
    uptimeHours: number
    errorRate: number
    memoryUsageMB: number
  }
}

class HealthChecker {
  // バーンレートの妥当性チェック
  checkBurnRate(burnRate: number): boolean
  
  // プロセス稼働時間のチェック
  checkProcessUptime(startTime: number): boolean
  
  // エラー率のチェック
  checkErrorRate(errorCount: number, totalRequests: number): boolean
  
  // メモリ使用量のチェック
  checkMemoryUsage(): boolean
  
  // 総合的な健康診断
  performHealthCheck(): HealthCheckResult
}
```

#### 異常値判定基準

| メトリクス | 正常範囲 | 警告範囲 | 異常範囲 |
|-----------|---------|---------|---------|
| burn_rate | 0-5,000 tokens/min | 5,000-10,000 | 10,000以上 |
| uptime | 0-48時間 | 48-72時間 | 72時間以上 |
| error_rate | 0-5% | 5-10% | 10%以上 |
| memory_usage | 0-50MB | 50-100MB | 100MB以上 |

### 2. 自己修復機能

StatusUpdaterクラスに自己修復機能を追加。

#### 自己診断の実行タイミング
- 6時間ごとの定期診断
- 連続3回のエラー発生時
- 異常値検出時（即座に実行）

#### 修復アクション

```typescript
class StatusUpdater {
  private async performSelfHealing(): Promise<void> {
    // 1. キャッシュのクリア
    this.clearCache()
    
    // 2. 統計情報のリセット
    this.resetStatistics()
    
    // 3. 内部状態の再初期化
    this.reinitializeInternalState()
    
    // 4. ccusageから最新データを強制取得
    await this.forceUpdateFromCcusage()
    
    // 5. 修復完了をログに記録
    logger.info('Self-healing completed')
  }
}
```

### 3. データ検証と補正

DataProcessorクラスに異常値の検証・補正機能を追加。

```typescript
class DataProcessor {
  private lastValidValues: Map<string, number> = new Map()
  
  validateAndCorrectBurnRate(burnRate: number): number {
    if (burnRate < 0 || burnRate > 10000) {
      logger.warn('Abnormal burn rate detected', { 
        burnRate, 
        lastValid: this.lastValidValues.get('burnRate') 
      })
      
      // 前回の正常値があればそれを使用
      const lastValid = this.lastValidValues.get('burnRate')
      if (lastValid !== undefined) {
        return lastValid
      }
      
      // なければ0を返す
      return 0
    }
    
    // 正常値を記録
    this.lastValidValues.set('burnRate', burnRate)
    return burnRate
  }
}
```

### 4. tmux変数での健康状態公開

以下の変数を追加：

| 変数名 | 説明 | 値の例 |
|--------|------|--------|
| @ccusage_daemon_health | デーモンの健康状態 | healthy/degraded/unhealthy |
| @ccusage_daemon_uptime | デーモン稼働時間 | 2h30m |
| @ccusage_daemon_uptime_hours | デーモン稼働時間（時間） | 2.5 |
| @ccusage_last_self_heal | 最後の自己修復時刻 | 2025-07-25 10:30:00 |
| @ccusage_error_rate | エラー率 | 2.5% |
| @ccusage_memory_usage | メモリ使用量 | 25.3MB |

### 5. ログとメトリクス

#### ログ出力
- 自己診断実行時: INFO レベル
- 異常検出時: WARN レベル
- 自己修復実行時: INFO レベル
- 修復失敗時: ERROR レベル

#### メトリクス記録
- 自己診断実行回数
- 異常検出回数
- 自己修復実行回数
- 各種異常の発生頻度

## 実装順序

1. **HealthCheckerクラスの実装**
   - 各種チェックメソッドの実装
   - 総合診断機能の実装

2. **DataProcessorの拡張**
   - 異常値検証・補正機能の追加
   - 正常値履歴の管理

3. **StatusUpdaterの拡張**
   - 自己診断タイマーの実装
   - 自己修復機能の実装

4. **VariableManagerの拡張**
   - 健康状態変数の追加
   - 変数マップ生成の更新

5. **統合テスト**
   - 長時間稼働シミュレーション
   - 異常値注入テスト
   - 自己修復の動作確認

## 期待される効果

1. **安定性向上**: 長期稼働でも異常値が自動的に修正される
2. **可観測性**: ユーザーがデーモンの健康状態を監視できる
3. **保守性**: 問題の早期発見と自動修復により、手動介入の必要性が減少
4. **信頼性**: tmuxの長期稼働という使用パターンに適合した設計

## 将来の拡張性

- 健康状態の履歴記録
- 異常パターンの学習機能
- より高度な自己修復アルゴリズム
- 外部監視システムとの連携