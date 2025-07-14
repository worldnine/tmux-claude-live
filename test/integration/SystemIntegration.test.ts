import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import { StatusUpdater } from '../../src/tmux/StatusUpdater'
import { CcusageClient } from '../../src/core/CcusageClient'
import { DataProcessor } from '../../src/core/DataProcessor'
import { ConfigManager } from '../../src/core/ConfigManager'
import { VariableManager } from '../../src/tmux/VariableManager'
import { LockManager } from '../../src/utils/LockManager'
import { HotReloader, ProcessManager } from '../../src/utils/HotReloader'
import { MockCommandExecutor } from '../../src/utils/CommandExecutor'

// 外部依存をモック
vi.mock('../../src/utils/LockManager')
vi.mock('../../src/utils/HotReloader')
vi.mock('../../src/utils/Logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))
vi.mock('../../src/utils/ErrorHandler', () => ({
  errorHandler: {
    handleError: vi.fn().mockResolvedValue(true)
  }
}))

describe('System Integration Tests', () => {
  let statusUpdater: StatusUpdater
  let mockExecutor: MockCommandExecutor
  let mockLockManager: any
  let mockHotReloader: any
  let mockProcessManager: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockExecutor = new MockCommandExecutor()
    
    // LockManagerのモック
    mockLockManager = {
      acquire: vi.fn().mockReturnValue(true),
      release: vi.fn(),
      setupAutoRelease: vi.fn(),
      getLockInfo: vi.fn().mockReturnValue({ pid: 12345 }),
      isLocked: vi.fn().mockReturnValue(false)
    }
    vi.mocked(LockManager).mockImplementation(() => mockLockManager)
    
    // HotReloaderのモック
    mockHotReloader = {
      start: vi.fn(),
      stop: vi.fn(),
      isEnabled: vi.fn().mockReturnValue(true),
      getWatchedPaths: vi.fn().mockReturnValue(['src'])
    }
    vi.mocked(HotReloader).mockImplementation(() => mockHotReloader)
    
    // ProcessManagerのモック
    mockProcessManager = {
      enableHotReload: vi.fn(),
      setRestartCallback: vi.fn(),
      cleanup: vi.fn()
    }
    vi.mocked(ProcessManager).mockImplementation(() => ({
      getInstance: vi.fn().mockReturnValue(mockProcessManager)
    }))
    
    // 依存関係の作成
    const ccusageClient = new CcusageClient(mockExecutor)
    const dataProcessor = new DataProcessor()
    const configManager = new ConfigManager(mockExecutor)
    const variableManager = new VariableManager(mockExecutor)
    
    statusUpdater = new StatusUpdater(ccusageClient, dataProcessor, configManager, variableManager)
  })

  afterEach(() => {
    statusUpdater.stopDaemon()
  })

  describe('LockManager Integration', () => {
    test('should prevent multiple daemon instances', () => {
      // Arrange - 最初のインスタンスがロック取得
      expect(() => statusUpdater.startDaemon(1000)).not.toThrow()
      expect(mockLockManager.acquire).toHaveBeenCalled()
      
      // Arrange - 2番目のインスタンス用にロック取得失敗をシミュレート
      mockLockManager.acquire.mockReturnValue(false)
      mockLockManager.getLockInfo.mockReturnValue({ pid: 54321 })
      
      const secondStatusUpdater = new StatusUpdater(
        new CcusageClient(mockExecutor),
        new DataProcessor(),
        new ConfigManager(mockExecutor),
        new VariableManager(mockExecutor)
      )
      
      // Act & Assert - 2番目のインスタンスは起動に失敗
      expect(() => secondStatusUpdater.startDaemon(1000)).toThrow('Another daemon is already running (PID: 54321)')
    })

    test('should automatically release lock on daemon stop', () => {
      // Arrange
      statusUpdater.startDaemon(1000)
      expect(mockLockManager.acquire).toHaveBeenCalled()
      
      // Act
      statusUpdater.stopDaemon()
      
      // Assert
      expect(mockLockManager.release).toHaveBeenCalled()
    })

    test('should setup auto-release on daemon start', () => {
      // Act
      statusUpdater.startDaemon(1000)
      
      // Assert
      expect(mockLockManager.setupAutoRelease).toHaveBeenCalled()
    })
  })

  describe('Performance and Caching Integration', () => {
    test('should demonstrate cache efficiency over multiple updates', async () => {
      // Arrange - 安定したデータでキャッシュ効率を測定
      const stableBlockData = {
        isActive: true,
        totalTokens: 25000,
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 },
        projection: { remainingMinutes: 180 },
        burnRate: { tokensPerMinute: 138.89 }
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [stableBlockData] }))

      // Act - 複数回の更新を実行
      const updateCount = 10
      const startTime = Date.now()
      
      for (let i = 0; i < updateCount; i++) {
        await statusUpdater.updateOnce()
      }
      
      const totalTime = Date.now() - startTime
      
      // Assert - キャッシュにより高い効率を実現
      const metrics = statusUpdater.getCacheMetrics()
      const hitRate = metrics.totalHits / (metrics.totalHits + metrics.totalMisses)
      
      expect(hitRate).toBeGreaterThan(0.7) // 70%以上のキャッシュヒット率
      expect(metrics.totalHits).toBeGreaterThan(5) // 少なくとも5回はキャッシュヒット
      expect(totalTime).toBeLessThan(1000) // 全体で1秒以内（キャッシュ効果）
    })

    test('should adapt TTL based on data change patterns', async () => {
      // Arrange - 変化するデータパターンを作成
      const changingData = []
      for (let i = 0; i < 8; i++) {
        changingData.push({
          isActive: true,
          totalTokens: 25000 + (i * 500), // 毎回500トークン増加
          startTime: '2025-07-09T15:00:00.000Z',
          endTime: '2025-07-09T20:00:00.000Z',
          tokenLimitStatus: { limit: 140000 },
          projection: { remainingMinutes: 180 - (i * 5) },
          burnRate: { tokensPerMinute: 138.89 }
        })
      }

      // Act - 変化するデータで複数回実行
      for (let i = 0; i < changingData.length; i++) {
        mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [changingData[i]] }))
        await statusUpdater.updateOnce()
      }

      // Assert - 高い変化頻度によりTTLが調整される
      const metrics = statusUpdater.getCacheMetrics()
      expect(metrics.dataChangeFrequency).toBeGreaterThan(0.5) // 50%以上の変化頻度
      expect(metrics.adaptiveTTL).toBeGreaterThan(0) // TTLが調整されている
    })

    test('should maintain performance under simulated load', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 並行更新のシミュレーション
      const concurrentUpdates = 15
      const promises = []
      const startTime = Date.now()
      
      for (let i = 0; i < concurrentUpdates; i++) {
        promises.push(statusUpdater.updateOnce())
      }
      
      await Promise.all(promises)
      const totalTime = Date.now() - startTime

      // Assert - 高負荷でも安定したパフォーマンス
      const status = statusUpdater.getStatus()
      expect(status.updateCount).toBe(concurrentUpdates)
      expect(status.errorCount).toBe(0)
      expect(totalTime).toBeLessThan(2000) // 2秒以内
    })
  })

  describe('Differential Update System Integration', () => {
    test('should minimize tmux command execution through differential updates', async () => {
      // Arrange - 初期データ
      const initialData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 },
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z'
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [initialData] }))

      // Act - 初回更新
      await statusUpdater.updateOnce()
      const initialCommandCount = mockExecutor.getExecutedCommands().length
      
      // Act - 同じデータで2回目更新（差分なし）
      await statusUpdater.updateOnce()
      const secondCommandCount = mockExecutor.getExecutedCommands().length
      
      // Arrange - 部分的に変更されたデータ
      const partiallyChangedData = {
        ...initialData,
        totalTokens: 25100 // わずかな変化（スマートハッシュで無視される範囲）
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [partiallyChangedData] }))
      
      // Act - 微細な変化での3回目更新
      await statusUpdater.updateOnce()
      const thirdCommandCount = mockExecutor.getExecutedCommands().length

      // Assert - 差分更新により無駄な更新が回避される
      expect(secondCommandCount - initialCommandCount).toBeLessThan(3) // キャッシュヒットで最小限のコマンド
      expect(thirdCommandCount - secondCommandCount).toBeLessThan(3) // スマートハッシュでキャッシュヒット
    })

    test('should detect significant changes and update accordingly', async () => {
      // Arrange - 初期データ
      const initialData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [initialData] }))
      await statusUpdater.updateOnce()

      // Arrange - 大きな変化
      const significantlyChangedData = {
        isActive: true,
        totalTokens: 30000, // 大きな変化（5000トークン増加）
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [significantlyChangedData] }))
      
      const beforeCommandCount = mockExecutor.getExecutedCommands().length

      // Act - 大きな変化での更新
      await statusUpdater.updateOnce()
      
      // Assert - 大きな変化により適切に更新される
      const afterCommandCount = mockExecutor.getExecutedCommands().length
      expect(afterCommandCount - beforeCommandCount).toBeGreaterThan(5) // 多くの変数が更新される
      
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBeGreaterThan(1) // キャッシュミスが発生
    })
  })

  describe('Error Handling and Recovery Integration', () => {
    test('should recover from ccusage failures with exponential backoff', async () => {
      // Arrange - 最初の2回は失敗、3回目は成功
      let callCount = 0
      mockExecutor.setDynamicResponse('ccusage blocks --active --json --token-limit 140000', () => {
        callCount++
        if (callCount <= 2) {
          throw new Error(`Attempt ${callCount} failed`)
        }
        return JSON.stringify({
          blocks: [{
            isActive: true,
            totalTokens: 25000,
            tokenLimitStatus: { limit: 140000 }
          }]
        })
      })

      // Act
      await statusUpdater.updateOnce()

      // Assert - リトライが成功し、回復が記録される
      const status = statusUpdater.getStatus()
      expect(status.recoveryCount).toBeGreaterThan(0)
      expect(callCount).toBe(3) // 2回失敗 + 1回成功
    })

    test('should maintain stability despite intermittent failures', async () => {
      // Arrange - 断続的な失敗をシミュレート
      let callCount = 0
      mockExecutor.setDynamicResponse('ccusage blocks --active --json --token-limit 140000', () => {
        callCount++
        if (callCount % 3 === 0) {
          throw new Error('Intermittent failure')
        }
        return JSON.stringify({
          blocks: [{
            isActive: true,
            totalTokens: 25000 + callCount * 100,
            tokenLimitStatus: { limit: 140000 }
          }]
        })
      })

      // Act - 複数回更新で混在シナリオをテスト
      const updateCount = 9
      for (let i = 0; i < updateCount; i++) {
        await statusUpdater.updateOnce()
      }

      // Assert - 一部失敗があっても全体の安定性を維持
      const status = statusUpdater.getStatus()
      expect(status.updateCount).toBe(updateCount)
      expect(status.errorCount).toBe(3) // 3回、6回、9回目が失敗
      expect(status.recoveryCount).toBe(3) // 各エラーから回復
      expect(status.lastUpdateTime).not.toBeNull() // 最後の更新時刻が記録されている
    })

    test('should gracefully handle complete system failures', async () => {
      // Arrange - 全てのコマンドを失敗させる
      mockExecutor.setError('ccusage blocks --active --json --token-limit 140000', new Error('System failure'))
      mockExecutor.setError('tmux show-option', new Error('Tmux failure'))
      mockExecutor.setError('tmux set-option', new Error('Tmux set failure'))

      // Act
      await statusUpdater.updateOnce()

      // Assert - 完全失敗でも例外を投げずに処理を継続
      const status = statusUpdater.getStatus()
      expect(status.updateCount).toBe(1) // 更新試行はカウントされる
      expect(status.errorCount).toBe(1) // エラーが記録される
      expect(status.recoveryCount).toBeGreaterThan(0) // 回復処理が実行される
    })
  })

  describe('Component Integration Flow', () => {
    test('should demonstrate end-to-end data flow with all components', async () => {
      // Arrange - 完全なccusageレスポンス
      const fullCcusageResponse = {
        blocks: [{
          isActive: true,
          totalTokens: 75000,
          costUSD: 25.50,
          startTime: '2025-07-09T15:00:00.000Z',
          endTime: '2025-07-09T20:00:00.000Z',
          projection: { remainingMinutes: 120 },
          burnRate: { tokensPerMinute: 625 },
          tokenLimitStatus: {
            limit: 140000,
            projectedUsage: 75000,
            percentUsed: 53.57,
            status: 'warning'
          }
        }]
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify(fullCcusageResponse))
      
      // カスタム設定
      mockExecutor.setResponse('tmux show-option -gqv @ccusage_token_limit', '140000')
      mockExecutor.setResponse('tmux show-option -gqv @ccusage_update_interval', '5')
      mockExecutor.setResponse('tmux show-option -gqv @ccusage_time_format', 'compact')

      // Act - 完全な更新サイクル
      await statusUpdater.updateOnce()

      // Assert - 各コンポーネントの統合動作を確認
      const executedCommands = mockExecutor.getExecutedCommands()
      
      // 1. CcusageClient: データ取得
      expect(mockExecutor.wasCommandExecuted('ccusage blocks --active --json --token-limit 140000')).toBe(true)
      
      // 2. ConfigManager: 設定読み込み
      expect(mockExecutor.wasCommandExecuted('tmux show-option -gqv @ccusage_token_limit')).toBe(true)
      
      // 3. DataProcessor: データ処理結果の確認
      const usagePercentCommand = executedCommands.find(cmd => 
        cmd.includes('@ccusage_usage_percent') && cmd.includes('53.57%')
      )
      expect(usagePercentCommand).toBeDefined()
      
      // 4. ColorResolver: 警告レベルの色決定
      const warningColorCommand = executedCommands.find(cmd => 
        cmd.includes('@ccusage_warning_color') && cmd.includes('colour3') // yellow for warning
      )
      expect(warningColorCommand).toBeDefined()
      
      // 5. VariableManager: tmux変数設定
      expect(mockExecutor.wasCommandExecuted('tmux set-option')).toBe(true)
      
      // 6. 主要な変数の設定確認
      const requiredVariables = [
        'ccusage_is_active',
        'ccusage_total_tokens',
        'ccusage_usage_percent',
        'ccusage_warning_level',
        'ccusage_warning_color',
        'ccusage_time_remaining'
      ]
      
      for (const variable of requiredVariables) {
        expect(executedCommands.some(cmd => cmd.includes(`@${variable}`))).toBe(true)
      }
    })

    test('should handle configuration changes dynamically', async () => {
      // Arrange - 初期設定
      const initialBlockData = {
        isActive: true,
        totalTokens: 50000,
        tokenLimitStatus: { limit: 100000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 100000', JSON.stringify({ blocks: [initialBlockData] }))
      mockExecutor.setResponse('tmux show-option -gqv @ccusage_token_limit', '100000')
      
      await statusUpdater.updateOnce()
      
      // Arrange - 設定変更（制限値変更）
      const newBlockData = {
        isActive: true,
        totalTokens: 50000, // 同じトークン数
        tokenLimitStatus: { limit: 200000 } // 制限値を倍に
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 200000', JSON.stringify({ blocks: [newBlockData] }))
      mockExecutor.setResponse('tmux show-option -gqv @ccusage_token_limit', '200000')

      // Act - 設定変更後の更新
      await statusUpdater.updateOnce()

      // Assert - 設定変更により使用率が半分になることを確認
      const executedCommands = mockExecutor.getExecutedCommands()
      const newUsageCommand = executedCommands.find(cmd => 
        cmd.includes('@ccusage_usage_percent') && cmd.includes('25.00%') // 50000/200000 = 25%
      )
      expect(newUsageCommand).toBeDefined()
      
      // キャッシュが無効化されて新しい計算が実行されることを確認
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(2) // 初回 + 設定変更後
    })
  })

  describe('Real-time Responsiveness', () => {
    test('should respond quickly to data changes', async () => {
      // Arrange - 複数の異なるデータセット
      const datasets = [
        { totalTokens: 25000, status: 'ok' },
        { totalTokens: 35000, status: 'ok' },
        { totalTokens: 45000, status: 'warning' },
        { totalTokens: 55000, status: 'warning' }
      ]

      const responseTimes: number[] = []

      // Act - 各データセットでの応答時間を測定
      for (const dataset of datasets) {
        const blockData = {
          isActive: true,
          totalTokens: dataset.totalTokens,
          tokenLimitStatus: { 
            limit: 140000,
            status: dataset.status 
          }
        }
        
        mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [blockData] }))
        
        const startTime = Date.now()
        await statusUpdater.updateOnce()
        const responseTime = Date.now() - startTime
        
        responseTimes.push(responseTime)
      }

      // Assert - 一貫して高速な応答時間
      const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      expect(averageResponseTime).toBeLessThan(100) // 平均100ms以下
      expect(Math.max(...responseTimes)).toBeLessThan(200) // 最大でも200ms以下
    })
  })
})