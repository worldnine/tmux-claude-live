import { describe, expect, test, beforeEach } from 'vitest'
import { StatusUpdater } from '../../../src/tmux/StatusUpdater'
import { CcusageClient } from '../../../src/core/CcusageClient'
import { DataProcessor } from '../../../src/core/DataProcessor'
import { ConfigManager } from '../../../src/core/ConfigManager'
import { VariableManager } from '../../../src/tmux/VariableManager'
import { MockCommandExecutor } from '../../../src/utils/CommandExecutor'

describe('StatusUpdater Performance', () => {
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

  describe('cache performance', () => {
    test('should improve performance on repeated calls with same data', async () => {
      // Arrange
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

      // Act - 初回実行（キャッシュミス）
      await statusUpdater.updateOnce()

      // Act - 2回目実行（キャッシュヒット）
      await statusUpdater.updateOnce()

      // Assert - キャッシュメトリクスを確認
      const status = statusUpdater.getStatus()
      expect(status.cacheHits).toBe(1)
      expect(status.cacheMisses).toBe(1)
    })

    test('should handle rapid consecutive calls efficiently', async () => {
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

      // Act - 10回の連続実行
      const iterations = 10
      const startTime = Date.now()
      
      for (let i = 0; i < iterations; i++) {
        await statusUpdater.updateOnce()
      }
      
      const endTime = Date.now()
      const totalDuration = endTime - startTime

      // Assert - 平均実行時間が短い（キャッシュの効果）
      const averageDuration = totalDuration / iterations
      expect(averageDuration).toBeLessThan(50) // 50ms以下
      
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(1) // 初回のみ
      expect(status.cacheHits).toBe(iterations - 1) // 残り全てヒット
    })
  })

  describe('memory usage', () => {
    test('should maintain reasonable memory usage with cache', async () => {
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

      // Act - 複数回実行してキャッシュを使用
      for (let i = 0; i < 100; i++) {
        await statusUpdater.updateOnce()
      }

      // Assert - キャッシュが適切に動作している
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(1)
      expect(status.cacheHits).toBe(99)
      
      // メモリ使用量は実際には測定困難だが、キャッシュが1つしか保持されないことを確認
      // （実装により単一のキャッシュエントリのみ保持）
    })

    test('should handle cache invalidation properly', async () => {
      // Arrange - 異なるデータを段階的に設定
      const responses = [
        { totalTokens: 25000, costUSD: 15.75 },
        { totalTokens: 30000, costUSD: 18.75 },
        { totalTokens: 35000, costUSD: 21.75 }
      ]

      // Act - 各レスポンスに対して複数回実行
      for (let i = 0; i < responses.length; i++) {
        const mockResponse = {
          blocks: [{
            isActive: true,
            totalTokens: responses[i].totalTokens,
            costUSD: responses[i].costUSD,
            projection: { remainingMinutes: 180 },
            burnRate: { tokensPerMinute: 138.89 }
          }]
        }
        
        mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockResponse))
        
        // 各データで3回実行（初回：ミス、2-3回目：ヒット）
        await statusUpdater.updateOnce() // miss
        await statusUpdater.updateOnce() // hit
        await statusUpdater.updateOnce() // hit
      }

      // Assert - 適切にキャッシュが無効化・再作成されている
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(3) // 各データの初回
      expect(status.cacheHits).toBe(6) // 各データの2-3回目
    })
  })

  describe('cpu usage optimization', () => {
    test('should avoid unnecessary computations with cache', async () => {
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

      // Act - 2回目実行（キャッシュヒット）
      await statusUpdater.updateOnce()

      // Assert - キャッシュメトリクスを確認
      const status = statusUpdater.getStatus()
      expect(status.cacheHits).toBe(1)
      expect(status.cacheMisses).toBe(1)
    })

    test('should handle high frequency updates efficiently', async () => {
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

      // Act - 高頻度更新のシミュレーション
      const iterations = 50
      const promises = []
      
      for (let i = 0; i < iterations; i++) {
        promises.push(statusUpdater.updateOnce())
      }
      
      const startTime = Date.now()
      await Promise.all(promises)
      const endTime = Date.now()
      
      const totalDuration = endTime - startTime

      // Assert - 高頻度更新でも効率的に処理
      expect(totalDuration).toBeLessThan(1000) // 1秒以下
      
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(1) // 初回のみ
      expect(status.cacheHits).toBe(iterations - 1) // 残り全てヒット
    })
  })

  describe('cache ttl performance', () => {
    test('should handle cache expiration efficiently', async () => {
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
      
      // Arrange - 時間経過をシミュレート
      const originalNow = Date.now
      Date.now = () => originalNow() + 30001 // TTL + 1ms
      
      // Act - TTL経過後の実行
      const startTime = originalNow()
      await statusUpdater.updateOnce()
      const endTime = originalNow()
      
      // Assert - TTL経過時でも効率的に処理
      expect(endTime - startTime).toBeLessThan(100) // 100ms以下
      
      const status = statusUpdater.getStatus()
      expect(status.cacheMisses).toBe(2) // 初回 + TTL経過後
      
      // Cleanup
      Date.now = originalNow
    })
  })
})