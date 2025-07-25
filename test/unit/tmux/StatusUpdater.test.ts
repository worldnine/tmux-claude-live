import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { StatusUpdater } from '../../../src/tmux/StatusUpdater'
import { CcusageClient } from '../../../src/core/CcusageClient'
import { DataProcessor } from '../../../src/core/DataProcessor'
import { ConfigManager } from '../../../src/core/ConfigManager'
import { VariableManager } from '../../../src/tmux/VariableManager'
import { LockManager } from '../../../src/utils/LockManager'
import { MockCommandExecutor } from '../../../src/utils/CommandExecutor'
import { HealthChecker } from '../../../src/utils/HealthChecker'

// bunテスト環境用のモック設定は後で実装

describe('StatusUpdater', () => {
  let statusUpdater: StatusUpdater
  let mockExecutor: MockCommandExecutor
  let mockLockManager: any
  let ccusageClient: CcusageClient
  let dataProcessor: DataProcessor
  let configManager: ConfigManager
  let variableManager: VariableManager

  beforeEach(() => {
    vi.clearAllMocks()
    
    // MockCommandExecutorのセットアップ
    mockExecutor = new MockCommandExecutor()
    
    // LockManagerのモック
    mockLockManager = {
      acquire: vi.fn().mockReturnValue(true),
      release: vi.fn(),
      setupAutoRelease: vi.fn(),
      getLockInfo: vi.fn().mockReturnValue({ pid: 12345 })
    }
    vi.mocked(LockManager).mockImplementation(() => mockLockManager)
    
    // 依存関係の作成
    ccusageClient = new CcusageClient(mockExecutor)
    dataProcessor = new DataProcessor()
    configManager = new ConfigManager(mockExecutor)
    variableManager = new VariableManager(mockExecutor)
    
    statusUpdater = new StatusUpdater(ccusageClient, dataProcessor, configManager, variableManager)
  })

  afterEach(() => {
    statusUpdater.stopDaemon()
  })

  describe('constructor', () => {
    test('should initialize with provided dependencies', () => {
      expect(statusUpdater).toBeDefined()
      expect(statusUpdater.getUpdateCount()).toBe(0)
      expect(statusUpdater.getLastUpdateTime()).toBeNull()
      expect(statusUpdater.isDaemonRunning()).toBe(false)
    })

    test('should initialize with default dependencies when not provided', () => {
      const defaultStatusUpdater = new StatusUpdater()
      expect(defaultStatusUpdater).toBeDefined()
    })

    test('should initialize LockManager with correct name', () => {
      new StatusUpdater()
      expect(LockManager).toHaveBeenCalledWith('tmux-claude-live-daemon')
    })
  })

  describe('updateOnce - basic functionality', () => {
    test('should complete update cycle successfully', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        costUSD: 15.75,
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        projection: { remainingMinutes: 180 },
        burnRate: { tokensPerMinute: 138.89 },
        tokenLimitStatus: { limit: 140000 }
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act
      await statusUpdater.updateOnce()

      // Assert
      expect(statusUpdater.getUpdateCount()).toBe(1)
      expect(statusUpdater.getLastUpdateTime()).not.toBeNull()
      expect(statusUpdater.getLastUpdateTime()).toBeGreaterThan(Date.now() - 1000)
    })

    test('should handle ccusage command failure gracefully', async () => {
      // Arrange
      mockExecutor.setError('ccusage blocks --active --json --token-limit 140000', new Error('ccusage not found'))

      // Act & Assert - should not throw
      await statusUpdater.updateOnce()
      
      const status = statusUpdater.getStatus()
      expect(status.errorCount).toBe(1)
      expect(status.lastErrorTime).not.toBeNull()
      expect(status.recoveryCount).toBe(1) // errorHandler.handleError returns true
    })

    test('should handle inactive state correctly', async () => {
      // Arrange
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [] }))

      // Act
      await statusUpdater.updateOnce()

      // Assert
      expect(statusUpdater.getUpdateCount()).toBe(1)
      expect(statusUpdater.getLastUpdateTime()).not.toBeNull()
    })
  })

  describe('smart hash functionality', () => {
    test('should generate consistent config hash', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 同じ設定で2回実行
      await statusUpdater.updateOnce()
      await statusUpdater.updateOnce()

      // Assert - 2回目はキャッシュヒットされるはず
      const status = statusUpdater.getStatus()
      expect(status.cacheHits).toBe(1)
      expect(status.cacheMisses).toBe(1)
    })

    test('should detect config changes and invalidate cache', async () => {
      // Arrange - 初回実行
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))
      await statusUpdater.updateOnce()

      // Arrange - 設定変更をシミュレート（token limitを変更）
      mockExecutor.setResponse('tmux show-option -gqv @ccusage_token_limit', '200000')
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 200000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 設定変更後の実行
      await statusUpdater.updateOnce()

      // Assert - 設定変更によりキャッシュミスが発生
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(2) // 初回 + 設定変更後
      expect(status.cacheHits).toBe(0)
    })

    test('should use smart hash that ignores minor token changes', async () => {
      // Arrange - 初回実行
      const mockBlockData1 = {
        isActive: true,
        totalTokens: 25050, // 25,050 tokens
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData1] }))
      await statusUpdater.updateOnce()

      // Arrange - 微細な変化（100未満の変化）
      const mockBlockData2 = {
        isActive: true,
        totalTokens: 25080, // 25,080 tokens（30トークンの差）
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData2] }))

      // Act - 微細な変化後の実行
      await statusUpdater.updateOnce()

      // Assert - スマートハッシュにより変化が無視されキャッシュヒット
      const status = statusUpdater.getStatus()
      expect(status.cacheHits).toBe(1)
      expect(status.cacheMisses).toBe(1)
    })

    test('should detect significant token changes', async () => {
      // Arrange - 初回実行
      const mockBlockData1 = {
        isActive: true,
        totalTokens: 25000,
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData1] }))
      await statusUpdater.updateOnce()

      // Arrange - 大きな変化（100以上の変化）
      const mockBlockData2 = {
        isActive: true,
        totalTokens: 25200, // 200トークンの差
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData2] }))

      // Act
      await statusUpdater.updateOnce()

      // Assert - 大きな変化によりキャッシュミス
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(2)
      expect(status.cacheHits).toBe(0)
    })
  })

  describe('adaptive TTL functionality', () => {
    test('should initialize with default TTL', () => {
      const metrics = statusUpdater.getCacheMetrics()
      expect(metrics.adaptiveTTL).toBe(30000) // 30秒
    })

    test('should extend TTL when data changes infrequently', async () => {
      // Arrange - 同じデータで複数回実行してパターンを作る
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 複数回実行してデータ変化頻度を低くする
      for (let i = 0; i < 5; i++) {
        await statusUpdater.updateOnce()
        // 時間を少し進める（TTL内）
        vi.advanceTimersByTime(1000)
      }

      // Assert - 低い変化頻度によりTTLが延長される
      const metrics = statusUpdater.getCacheMetrics()
      expect(metrics.dataChangeFrequency).toBeLessThan(0.3)
      expect(metrics.adaptiveTTL).toBeGreaterThan(30000)
    })

    test('should shorten TTL when data changes frequently', async () => {
      // Arrange - 異なるデータで実行してパターンを作る
      const mockResponses = []
      for (let i = 0; i < 10; i++) {
        mockResponses.push({
          isActive: true,
          totalTokens: 25000 + (i * 200), // 毎回200トークン増加
          startTime: '2025-07-09T15:00:00.000Z',
          endTime: '2025-07-09T20:00:00.000Z',
          tokenLimitStatus: { limit: 140000 }
        })
      }

      // Act - 変化するデータで複数回実行
      for (let i = 0; i < mockResponses.length; i++) {
        mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockResponses[i]] }))
        await statusUpdater.updateOnce()
      }

      // Assert - 高い変化頻度によりTTLが短縮される
      const metrics = statusUpdater.getCacheMetrics()
      expect(metrics.dataChangeFrequency).toBeGreaterThan(0.8)
      expect(metrics.adaptiveTTL).toBeLessThan(30000)
    })

    test('should extend TTL when compute time is high', async () => {
      // Arrange - 計算時間を長くするために遅いレスポンスをシミュレート
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }

      // 遅いレスポンスをシミュレート
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }), 1500)

      // Act - 複数回実行して計算時間の履歴を作る
      for (let i = 0; i < 3; i++) {
        const startTime = Date.now()
        await statusUpdater.updateOnce()
        // 実際の計算時間をシミュレート
        vi.advanceTimersByTime(1500)
      }

      // Assert
      const metrics = statusUpdater.getCacheMetrics()
      expect(metrics.adaptiveTTL).toBeGreaterThan(30000)
    })

    test('should respect TTL bounds (5s min, 120s max)', async () => {
      // この場合、実際のアルゴリズムをテストするためには
      // 極端な条件を作る必要がある
      const metrics = statusUpdater.getCacheMetrics()
      expect(metrics.adaptiveTTL).toBeGreaterThanOrEqual(5000)
      expect(metrics.adaptiveTTL).toBeLessThanOrEqual(120000)
    })
  })

  describe('cache system', () => {
    test('should cache identical requests within TTL', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 初回実行
      await statusUpdater.updateOnce()
      
      // Act - TTL内での2回目実行
      await statusUpdater.updateOnce()

      // Assert
      const status = statusUpdater.getStatus()
      expect(status.cacheHits).toBe(1)
      expect(status.cacheMisses).toBe(1)
    })

    test('should invalidate cache after TTL expires', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 初回実行
      await statusUpdater.updateOnce()
      
      // Arrange - TTL経過をシミュレート
      const originalNow = Date.now
      Date.now = vi.fn(() => originalNow() + 35000) // 35秒後
      
      // Act - TTL経過後の実行
      await statusUpdater.updateOnce()

      // Assert
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(2) // 初回 + TTL経過後
      expect(status.cacheHits).toBe(0)
      
      // Cleanup
      Date.now = originalNow
    })

    test('should clear cache when clearAllVariables is called', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))
      await statusUpdater.updateOnce()

      // Act
      statusUpdater.clearAllVariables()
      await statusUpdater.updateOnce()

      // Assert
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(2) // 初回 + クリア後
      expect(status.cacheHits).toBe(0)
    })

    test('should provide accurate cache metrics', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 初回実行（キャッシュミス）
      await statusUpdater.updateOnce()
      // 2回目実行（キャッシュヒット）
      await statusUpdater.updateOnce()
      // 3回目実行（キャッシュヒット）
      await statusUpdater.updateOnce()

      // Assert
      const metrics = statusUpdater.getCacheMetrics()
      expect(metrics.totalHits).toBe(2)
      expect(metrics.totalMisses).toBe(1)
      expect(metrics.averageComputeTime).toBeGreaterThan(0)
      expect(metrics.dataChangeFrequency).toBeGreaterThanOrEqual(0)
      expect(metrics.adaptiveTTL).toBeGreaterThan(0)
    })
  })

  describe('retry functionality', () => {
    test('should retry config loading on failure', async () => {
      // Arrange - 最初の2回は失敗、3回目は成功
      let callCount = 0
      mockExecutor.setDynamicResponse('tmux show-option -gqv @ccusage_update_interval', () => {
        callCount++
        if (callCount <= 2) {
          throw new Error('tmux command failed')
        }
        return '5'
      })

      // Act
      await statusUpdater.updateOnce()

      // Assert - リトライが成功し、回復カウントが増加
      const status = statusUpdater.getStatus()
      expect(status.recoveryCount).toBeGreaterThanOrEqual(1)
      expect(callCount).toBe(3) // 2回失敗 + 1回成功
    })

    test('should retry ccusage data retrieval on failure', async () => {
      // Arrange - 最初は失敗、2回目は成功
      let callCount = 0
      mockExecutor.setDynamicResponse('ccusage blocks --active --json --token-limit 140000', () => {
        callCount++
        if (callCount === 1) {
          throw new Error('ccusage command failed')
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

      // Assert
      expect(callCount).toBe(2) // 1回失敗 + 1回成功
      expect(statusUpdater.getUpdateCount()).toBe(1)
    })

    test('should handle exponential backoff in retries', async () => {
      // Arrange
      const sleepSpy = vi.spyOn(statusUpdater as any, 'sleep').mockResolvedValue(undefined)
      
      // 全ての試行で失敗させる
      mockExecutor.setError('ccusage blocks --active --json --token-limit 140000', new Error('persistent failure'))

      // Act
      await statusUpdater.updateOnce()

      // Assert - 指数バックオフが実行される
      expect(sleepSpy).toHaveBeenCalledWith(2000) // 1回目のリトライ前

      sleepSpy.mockRestore()
    })

    test('should provide fallback values when all retries fail', async () => {
      // Arrange - すべての設定読み込みを失敗させる
      mockExecutor.setError('tmux show-option -gqv @ccusage_update_interval', new Error('persistent tmux failure'))
      mockExecutor.setError('tmux show-option -gqv @ccusage_token_limit', new Error('persistent tmux failure'))

      // Act
      await statusUpdater.updateOnce()

      // Assert - デフォルト値で動作し、回復カウントが増加
      const status = statusUpdater.getStatus()
      expect(status.recoveryCount).toBeGreaterThan(0)
    })
  })

  describe('daemon management', () => {
    test('should start daemon with lock acquisition', () => {
      // Act
      const intervalId = statusUpdater.startDaemon(1000)

      // Assert
      expect(mockLockManager.acquire).toHaveBeenCalled()
      expect(mockLockManager.setupAutoRelease).toHaveBeenCalled()
      expect(intervalId).toBeDefined()
      expect(statusUpdater.isDaemonRunning()).toBe(true)
    })

    test('should fail to start daemon when lock cannot be acquired', () => {
      // Arrange
      mockLockManager.acquire.mockReturnValue(false)
      mockLockManager.getLockInfo.mockReturnValue({ pid: 54321 })

      // Act & Assert
      expect(() => statusUpdater.startDaemon()).toThrow('Another daemon is already running (PID: 54321)')
    })

    test('should stop daemon and release lock', () => {
      // Arrange
      statusUpdater.startDaemon(1000)

      // Act
      statusUpdater.stopDaemon()

      // Assert
      expect(mockLockManager.release).toHaveBeenCalled()
      expect(statusUpdater.isDaemonRunning()).toBe(false)
    })

    test('should handle stopping non-running daemon gracefully', () => {
      // Act & Assert - should not throw
      expect(() => statusUpdater.stopDaemon()).not.toThrow()
    })

    test('should stop existing daemon when starting new one', () => {
      // Arrange
      const firstIntervalId = statusUpdater.startDaemon(1000)

      // Act
      const secondIntervalId = statusUpdater.startDaemon(2000)

      // Assert
      expect(secondIntervalId).not.toBe(firstIntervalId)
      expect(statusUpdater.isDaemonRunning()).toBe(true)
    })
  })

  describe('status information', () => {
    test('should return comprehensive status information', () => {
      // Act
      const status = statusUpdater.getStatus()

      // Assert
      expect(status).toMatchObject({
        isRunning: false,
        updateCount: 0,
        lastUpdateTime: null,
        interval: expect.any(Number),
        cacheHits: 0,
        cacheMisses: 0,
        errorCount: 0,
        lastErrorTime: null,
        recoveryCount: 0
      })
    })

    test('should include next update time when daemon is running', async () => {
      // Arrange
      statusUpdater.startDaemon(5000)
      await statusUpdater.updateOnce()

      // Act
      const status = statusUpdater.getStatus()

      // Assert
      expect(status.isRunning).toBe(true)
      expect(status.nextUpdateTime).toBeDefined()
      expect(status.nextUpdateTime).toBeGreaterThan(Date.now())
    })

    test('should track error statistics correctly', async () => {
      // Arrange
      mockExecutor.setError('ccusage blocks --active --json --token-limit 140000', new Error('test error'))

      // Act
      await statusUpdater.updateOnce()

      // Assert
      const status = statusUpdater.getStatus()
      expect(status.errorCount).toBe(1)
      expect(status.lastErrorTime).not.toBeNull()
      expect(status.recoveryCount).toBe(1) // errorHandler returns true
    })

    test('should provide accurate update tracking', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act
      const initialTime = Date.now()
      await statusUpdater.updateOnce()
      await statusUpdater.updateOnce()

      // Assert
      expect(statusUpdater.getUpdateCount()).toBe(2)
      expect(statusUpdater.getLastUpdateTime()).toBeGreaterThanOrEqual(initialTime)
    })
  })

  describe('integration scenarios', () => {
    test('should handle complete daemon lifecycle', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 完全なライフサイクル
      statusUpdater.startDaemon(1000)
      await statusUpdater.updateOnce()
      const runningStatus = statusUpdater.getStatus()
      statusUpdater.stopDaemon()
      const stoppedStatus = statusUpdater.getStatus()

      // Assert
      expect(runningStatus.isRunning).toBe(true)
      expect(runningStatus.updateCount).toBeGreaterThan(0)
      expect(stoppedStatus.isRunning).toBe(false)
      expect(mockLockManager.acquire).toHaveBeenCalled()
      expect(mockLockManager.release).toHaveBeenCalled()
    })

    test('should optimize performance through caching over time', async () => {
      // Arrange - 安定したデータでキャッシュ効率を測定
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        startTime: '2025-07-09T15:00:00.000Z',
        endTime: '2025-07-09T20:00:00.000Z',
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 複数回実行してキャッシュ効果を測定
      const iterations = 10
      for (let i = 0; i < iterations; i++) {
        await statusUpdater.updateOnce()
      }

      // Assert - キャッシュ効率が高いことを確認
      const metrics = statusUpdater.getCacheMetrics()
      const hitRate = metrics.totalHits / (metrics.totalHits + metrics.totalMisses)
      expect(hitRate).toBeGreaterThan(0.8) // 80%以上のヒット率
      expect(metrics.totalHits).toBeGreaterThan(5)
    })

    test('should handle mixed scenarios with errors and recovery', async () => {
      // Arrange - 成功と失敗を混在させる
      let callCount = 0
      mockExecutor.setDynamicResponse('ccusage blocks --active --json --token-limit 140000', () => {
        callCount++
        if (callCount % 3 === 0) {
          throw new Error('intermittent failure')
        }
        return JSON.stringify({
          blocks: [{
            isActive: true,
            totalTokens: 25000 + callCount * 100,
            tokenLimitStatus: { limit: 140000 }
          }]
        })
      })

      // Act - 複数回実行して混在シナリオをテスト
      for (let i = 0; i < 6; i++) {
        await statusUpdater.updateOnce()
      }

      // Assert
      const status = statusUpdater.getStatus()
      expect(status.updateCount).toBe(6)
      expect(status.errorCount).toBe(2) // 3回目と6回目が失敗
      expect(status.recoveryCount).toBe(2)
      expect(status.cacheMisses).toBeGreaterThan(0)
    })

    test('should maintain stability under high load', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act - 高負荷シミュレーション
      const promises = []
      for (let i = 0; i < 20; i++) {
        promises.push(statusUpdater.updateOnce())
      }
      await Promise.all(promises)

      // Assert - 安定性を確認
      const status = statusUpdater.getStatus()
      expect(status.updateCount).toBe(20)
      expect(status.errorCount).toBe(0)
      expect(status.lastUpdateTime).not.toBeNull()
    })
  })

  describe('clearAllVariables', () => {
    test('should clear variables and cache', () => {
      // Act & Assert - should not throw
      expect(() => statusUpdater.clearAllVariables()).not.toThrow()
    })
  })

  describe('getLastUpdateTime and getUpdateCount', () => {
    test('should return initial values correctly', () => {
      expect(statusUpdater.getLastUpdateTime()).toBeNull()
      expect(statusUpdater.getUpdateCount()).toBe(0)
    })

    test('should update after successful update', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act
      const beforeTime = Date.now()
      await statusUpdater.updateOnce()

      // Assert
      expect(statusUpdater.getUpdateCount()).toBe(1)
      expect(statusUpdater.getLastUpdateTime()).toBeGreaterThanOrEqual(beforeTime)
    })
  })

  describe('health check integration', () => {
    let healthChecker: HealthChecker

    beforeEach(() => {
      healthChecker = new HealthChecker()
      // StatusUpdaterにhealthCheckerを注入する必要がある（後で実装）
    })

    test('should perform health check periodically', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        burnRate: { tokensPerMinute: 200 },
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act
      await statusUpdater.updateOnce()
      
      // StatusUpdaterがHealthCheckerを使用して健康診断を実行することを確認
      const healthStatus = statusUpdater.getHealthStatus()

      // Assert
      expect(healthStatus).toBeDefined()
      expect(healthStatus.status).toMatch(/healthy|degraded|unhealthy/)
    })

    test('should detect abnormal burn rate and trigger self-healing', async () => {
      // Arrange - 異常なburn rateを含むデータ
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        burnRate: { tokensPerMinute: 33537.3 }, // 異常値
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act
      await statusUpdater.updateOnce()
      
      // Assert - 自己修復が実行されたことを確認
      const healthStatus = statusUpdater.getHealthStatus()
      expect(healthStatus.issues).toContain('Burn rate is abnormal: 33537.3')
      expect(healthStatus.lastSelfHealTime).toBeDefined()
    })

    test('should track daemon uptime and health metrics', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        burnRate: { tokensPerMinute: 200 },
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act
      statusUpdater.startDaemon(1000) // デーモン開始
      await statusUpdater.updateOnce()
      
      const healthStatus = statusUpdater.getHealthStatus()

      // Assert
      expect(healthStatus.metrics.uptimeHours).toBeGreaterThanOrEqual(0)
      expect(healthStatus.metrics.errorRate).toBeGreaterThanOrEqual(0)
      expect(healthStatus.metrics.memoryUsageMB).toBeGreaterThan(0)
      
      statusUpdater.stopDaemon()
    })

    test('should perform self-healing when multiple errors occur', async () => {
      // Arrange - 複数のエラーを発生させる
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', 'invalid json')

      // Act - 連続してエラーを発生させる
      await statusUpdater.updateOnce().catch(() => {}) // エラーを無視
      await statusUpdater.updateOnce().catch(() => {})
      await statusUpdater.updateOnce().catch(() => {})

      // Assert - 自己修復が実行されたことを確認
      expect(statusUpdater.getSelfHealingCount()).toBeGreaterThan(0)
    })

    test('should schedule periodic health checks every 6 hours', () => {
      // Arrange
      const spy = vi.spyOn(statusUpdater, 'performHealthCheck')

      // Act
      statusUpdater.startDaemon(1000)
      
      // Assert - 6時間タイマーが設定されていることを確認
      expect(statusUpdater.getHealthCheckInterval()).toBe(6 * 60 * 60 * 1000) // 6 hours in ms
      
      statusUpdater.stopDaemon()
    })

    test('should clear internal state during self-healing', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        burnRate: { tokensPerMinute: 200 },
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // 事前にキャッシュとカウンターを設定
      await statusUpdater.updateOnce()
      const initialUpdateCount = statusUpdater.getUpdateCount()

      // Act - 自己修復を実行
      await statusUpdater.performSelfHealing()

      // Assert - 内部状態がリセットされていることを確認
      expect(statusUpdater.getCacheSize()).toBe(0)
      expect(statusUpdater.getStatistics().cacheHits).toBe(0)
      expect(statusUpdater.getStatistics().cacheMisses).toBe(0)
    })

    test('should generate health status tmux variables', async () => {
      // Arrange
      const mockBlockData = {
        isActive: true,
        totalTokens: 25000,
        burnRate: { tokensPerMinute: 200 },
        tokenLimitStatus: { limit: 140000 }
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 140000', JSON.stringify({ blocks: [mockBlockData] }))

      // Act
      await statusUpdater.updateOnce()

      // Assert - 健康状態変数が設定されていることを確認
      const tmuxVariables = mockExecutor.getExecutedCommands()
        .filter(cmd => cmd.includes('set-option'))
        .join(' ')

      expect(tmuxVariables).toContain('@ccusage_daemon_health')
      expect(tmuxVariables).toContain('@ccusage_daemon_uptime')
      expect(tmuxVariables).toContain('@ccusage_error_rate')
    })
  })
})