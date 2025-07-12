import { describe, expect, test, beforeEach } from 'vitest'
import { StatusUpdater } from '../../../src/tmux/StatusUpdater'
import { CcusageClient } from '../../../src/core/CcusageClient'
import { DataProcessor } from '../../../src/core/DataProcessor'
import { ConfigManager } from '../../../src/core/ConfigManager'
import { VariableManager } from '../../../src/tmux/VariableManager'
import { MockCommandExecutor } from '../../../src/utils/CommandExecutor'

describe('StatusUpdater', () => {
  let statusUpdater: StatusUpdater
  let mockExecutor: MockCommandExecutor

  beforeEach(() => {
    mockExecutor = new MockCommandExecutor()
    const ccusageClient = new CcusageClient(mockExecutor)
    const dataProcessor = new DataProcessor()
    const configManager = new ConfigManager(mockExecutor)
    const variableManager = new VariableManager(mockExecutor)
    statusUpdater = new StatusUpdater(ccusageClient, dataProcessor, configManager, variableManager)
  })

  describe('updateAll', () => {
    test('should update all tmux variables with current data', async () => {
      // Act & Assert - should complete without throwing
      await statusUpdater.updateAll()
      expect(statusUpdater.getUpdateCount()).toBe(1)
    })

    test('should handle ccusage command failure gracefully', async () => {
      // Arrange - ccusageコマンドを失敗させる
      mockExecutor.setError('ccusage blocks --active --json', new Error('ccusage not found'))
      
      // Act & Assert - should complete without throwing
      await statusUpdater.updateAll()
      expect(statusUpdater.getUpdateCount()).toBe(1)
    })
  })

  describe('updateOnce', () => {
    test('should update variables once without interval', async () => {
      // Act & Assert - should complete without throwing
      await statusUpdater.updateOnce()
      expect(statusUpdater.getUpdateCount()).toBe(1)
    })

    test('should handle inactive state', async () => {
      // Arrange - 非アクティブな状態をモック
      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify({ blocks: [] }))
      
      // Act & Assert - should complete without throwing
      await statusUpdater.updateOnce()
      expect(statusUpdater.getUpdateCount()).toBe(1)
    })
  })

  describe('startDaemon', () => {
    test('should start daemon with default interval', () => {
      // Act
      const intervalId = statusUpdater.startDaemon()

      // Assert
      expect(intervalId).toBeDefined()
      expect(typeof intervalId).toBe('object')

      // Cleanup
      statusUpdater.stopDaemon()
    })

    test('should start daemon with custom interval', () => {
      // Arrange
      const customInterval = 10000 // 10 seconds

      // Act
      const intervalId = statusUpdater.startDaemon(customInterval)

      // Assert
      expect(intervalId).toBeDefined()
      expect(typeof intervalId).toBe('object')

      // Cleanup
      statusUpdater.stopDaemon()
    })

    test('should stop existing daemon when starting new one', () => {
      // Arrange
      const firstIntervalId = statusUpdater.startDaemon()

      // Act
      const secondIntervalId = statusUpdater.startDaemon()

      // Assert - should be different IDs since first is stopped
      expect(secondIntervalId).not.toBe(firstIntervalId)
      expect(statusUpdater.isDaemonRunning()).toBe(true)

      // Cleanup
      statusUpdater.stopDaemon()
    })
  })

  describe('stopDaemon', () => {
    test('should stop running daemon', () => {
      // Arrange
      statusUpdater.startDaemon()

      // Act & Assert - should not throw
      expect(() => statusUpdater.stopDaemon()).not.toThrow()
    })

    test('should handle stopping non-running daemon', () => {
      // Act & Assert - should not throw
      expect(() => statusUpdater.stopDaemon()).not.toThrow()
    })
  })

  describe('isDaemonRunning', () => {
    test('should return false initially', () => {
      // Assert
      expect(statusUpdater.isDaemonRunning()).toBe(false)
    })

    test('should return true when daemon is running', () => {
      // Arrange
      statusUpdater.startDaemon()

      // Assert
      expect(statusUpdater.isDaemonRunning()).toBe(true)

      // Cleanup
      statusUpdater.stopDaemon()
    })

    test('should return false after stopping daemon', () => {
      // Arrange
      statusUpdater.startDaemon()
      statusUpdater.stopDaemon()

      // Assert
      expect(statusUpdater.isDaemonRunning()).toBe(false)
    })
  })

  describe('clearAllVariables', () => {
    test('should clear all ccusage variables', () => {
      // Act & Assert - should not throw
      expect(() => statusUpdater.clearAllVariables()).not.toThrow()
    })
  })

  describe('getLastUpdateTime', () => {
    test('should return null initially', () => {
      // Assert
      expect(statusUpdater.getLastUpdateTime()).toBeNull()
    })

    test('should return timestamp after update', async () => {
      // Arrange
      const beforeUpdate = Date.now()

      // Act
      await statusUpdater.updateOnce()

      // Assert
      const lastUpdateTime = statusUpdater.getLastUpdateTime()
      expect(lastUpdateTime).not.toBeNull()
      expect(lastUpdateTime).toBeGreaterThanOrEqual(beforeUpdate)
    })
  })

  describe('getUpdateCount', () => {
    test('should return 0 initially', () => {
      // Assert
      expect(statusUpdater.getUpdateCount()).toBe(0)
    })

    test('should increment after each update', async () => {
      // Arrange
      const initialCount = statusUpdater.getUpdateCount()

      // Act
      await statusUpdater.updateOnce()

      // Assert
      expect(statusUpdater.getUpdateCount()).toBe(initialCount + 1)
    })
  })

  describe('getStatus', () => {
    test('should return current status information', () => {
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

    test('should reflect daemon status', () => {
      // Arrange
      statusUpdater.startDaemon()

      // Act
      const status = statusUpdater.getStatus()

      // Assert
      expect(status.isRunning).toBe(true)

      // Cleanup
      statusUpdater.stopDaemon()
    })

    test('should track cache metrics', async () => {
      // Arrange - 同じデータでの連続実行
      const mockCcusageResponse = {
        blocks: [{
          isActive: true,
          totalTokens: 25000,
          costUSD: 15.75,
          projection: { remainingMinutes: 180 },
          burnRate: { tokensPerMinute: 138.89 }
        }]
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockCcusageResponse))

      // Act - 初回実行（キャッシュミス）
      await statusUpdater.updateOnce()
      let status = statusUpdater.getStatus()
      
      // Assert - 初回はキャッシュミス
      expect(status.cacheMisses).toBe(1)
      expect(status.cacheHits).toBe(0)

      // Act - 2回目実行（キャッシュヒット）
      await statusUpdater.updateOnce()
      status = statusUpdater.getStatus()
      
      // Assert - 2回目はキャッシュヒット
      expect(status.cacheMisses).toBe(1)
      expect(status.cacheHits).toBe(1)
    })
  })

  describe('cache functionality', () => {
    test('should use cache when data has not changed', async () => {
      // Arrange - 同じデータでの連続実行
      const mockCcusageResponse = {
        blocks: [{
          isActive: true,
          totalTokens: 25000,
          costUSD: 15.75,
          startTime: '2025-07-09T15:00:00.000Z',
          endTime: '2025-07-09T20:00:00.000Z',
          projection: { remainingMinutes: 180 },
          burnRate: { tokensPerMinute: 138.89 }
        }]
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockCcusageResponse))

      // Act - 初回実行
      await statusUpdater.updateOnce()
      
      // Act - 2回目実行（キャッシュヒットのはず）
      await statusUpdater.updateOnce()
      
      // Assert - キャッシュメトリクスを確認
      const status = statusUpdater.getStatus()
      expect(status.cacheHits).toBe(1)
      expect(status.cacheMisses).toBe(1)
    })

    test('should invalidate cache when data changes', async () => {
      // Arrange - 1回目のデータ
      const firstResponse = {
        blocks: [{
          isActive: true,
          totalTokens: 25000,
          costUSD: 15.75,
          projection: { remainingMinutes: 180 },
          burnRate: { tokensPerMinute: 138.89 }
        }]
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(firstResponse))
      
      // Act - 初回実行
      await statusUpdater.updateOnce()
      
      // Arrange - 2回目のデータ（変更あり）
      const secondResponse = {
        blocks: [{
          isActive: true,
          totalTokens: 30000, // 変更
          costUSD: 18.75,
          projection: { remainingMinutes: 160 }, // 変更
          burnRate: { tokensPerMinute: 150.00 }
        }]
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(secondResponse))
      
      // Act - 2回目実行
      await statusUpdater.updateOnce()
      
      // Assert - データが変更されたのでキャッシュミスが発生
      const status = statusUpdater.getStatus()
      expect(status.cacheHits).toBe(0)
      expect(status.cacheMisses).toBe(2)
    })

    test('should invalidate cache after TTL expires', async () => {
      // Arrange
      const mockCcusageResponse = {
        blocks: [{
          isActive: true,
          totalTokens: 25000,
          costUSD: 15.75,
          projection: { remainingMinutes: 180 },
          burnRate: { tokensPerMinute: 138.89 }
        }]
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockCcusageResponse))

      // Act - 初回実行
      await statusUpdater.updateOnce()
      
      // Arrange - 時間経過をシミュレート（30秒 + 1ms）
      const originalNow = Date.now
      Date.now = () => originalNow() + 30001
      
      // Act - TTL経過後の実行
      await statusUpdater.updateOnce()
      
      // Assert - TTL経過によりキャッシュが無効化される
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(2) // 初回 + TTL経過後
      expect(status.cacheHits).toBe(0)
      
      // Cleanup
      Date.now = originalNow
    })

    test('should clear cache when clearAllVariables is called', async () => {
      // Arrange
      const mockCcusageResponse = {
        blocks: [{
          isActive: true,
          totalTokens: 25000,
          costUSD: 15.75,
          projection: { remainingMinutes: 180 },
          burnRate: { tokensPerMinute: 138.89 }
        }]
      }
      
      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockCcusageResponse))

      // Act - 初回実行でキャッシュを作成
      await statusUpdater.updateOnce()
      
      // Act - キャッシュをクリア
      statusUpdater.clearAllVariables()
      
      // Act - 再度実行
      await statusUpdater.updateOnce()
      
      // Assert - キャッシュがクリアされているためキャッシュミスが発生
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(2) // 初回 + クリア後
      expect(status.cacheHits).toBe(0)
    })
  })

  describe('integration', () => {
    test('should handle complete update cycle', async () => {
      // Arrange
      statusUpdater.startDaemon()

      // Act
      await statusUpdater.updateOnce()

      // Assert
      expect(statusUpdater.isDaemonRunning()).toBe(true)
      expect(statusUpdater.getUpdateCount()).toBeGreaterThan(0)
      expect(statusUpdater.getLastUpdateTime()).not.toBeNull()

      // Cleanup
      statusUpdater.stopDaemon()
    })
  })
})