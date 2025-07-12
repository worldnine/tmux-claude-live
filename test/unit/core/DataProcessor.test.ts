import { describe, expect, test, beforeEach } from 'vitest'
import { DataProcessor } from '../../../src/core/DataProcessor'
import type { BlockData } from '../../../src/core/CcusageClient'
import type { ProcessedData } from '../../../src/core/DataProcessor'

describe('DataProcessor', () => {
  let processor: DataProcessor

  beforeEach(() => {
    processor = new DataProcessor()
  })

  describe('processBlockData', () => {
    test('should process active block data correctly', () => {
      // Arrange
      const blockData: BlockData = {
        isActive: true,
        totalTokens: 12500,
        costUSD: 1.85,
        projection: {
          remainingMinutes: 135  // 2h15m
        },
        burnRate: {
          tokensPerMinute: 250
        },
        tokenCounts: {
          inputTokens: 5000,
          outputTokens: 7500
        }
      }

      const tokenLimit = 140000

      // Act
      const result = processor.processBlockData(blockData, tokenLimit)

      // Assert
      expect(result).toBeDefined()
      expect(result.isActive).toBe(true)
      expect(result.totalTokens).toBe(12500)
      expect(result.costUSD).toBe(1.85)
      expect(result.remainingMinutes).toBe(135)
      expect(result.remainingSeconds).toBe(8100) // 135 * 60
      expect(result.burnRate).toBe(250)
      expect(result.usagePercent).toBeCloseTo(8.93, 2) // (12500/140000) * 100
      expect(result.tokensRemaining).toBe(127500) // 140000 - 12500
      expect(result.blockProgress).toBeCloseTo(55, 0) // (180/300) * 100 = 60%
    })

    test('should process inactive block data', () => {
      // Arrange
      const blockData: BlockData = {
        isActive: false,
        totalTokens: 140000,
        costUSD: 20.50,
        projection: {
          remainingMinutes: 0
        },
        burnRate: {
          tokensPerMinute: 0
        }
      }

      const tokenLimit = 140000

      // Act
      const result = processor.processBlockData(blockData, tokenLimit)

      // Assert
      expect(result.isActive).toBe(false)
      expect(result.remainingMinutes).toBe(0)
      expect(result.usagePercent).toBe(100)
      expect(result.tokensRemaining).toBe(0)
      expect(result.blockProgress).toBe(100)
    })

    test('should handle null block data', () => {
      // Arrange
      const blockData = null
      const tokenLimit = 140000

      // Act
      const result = processor.processBlockData(blockData, tokenLimit)

      // Assert
      expect(result.isActive).toBe(false)
      expect(result.totalTokens).toBe(0)
      expect(result.costUSD).toBe(0)
      expect(result.remainingMinutes).toBe(0)
      expect(result.usagePercent).toBe(0)
      expect(result.tokensRemaining).toBe(tokenLimit)
    })

    test('should calculate warning levels correctly', () => {
      // Arrange
      const testCases = [
        { tokens: 70000, limit: 100000, expectedLevel: 'warning' },  // 70%
        { tokens: 95000, limit: 100000, expectedLevel: 'danger' },   // 95%
        { tokens: 50000, limit: 100000, expectedLevel: 'normal' },   // 50%
        { tokens: 105000, limit: 100000, expectedLevel: 'danger' },  // 105% (超過)
      ]

      testCases.forEach(({ tokens, limit, expectedLevel }) => {
        const blockData: BlockData = {
          isActive: true,
          totalTokens: tokens,
          costUSD: 1.0,
          projection: { remainingMinutes: 120 },  // 2時間（時間ベースの警告を回避）
          burnRate: { tokensPerMinute: 100 }
        }

        // Act
        const result = processor.processBlockData(blockData, limit)

        // Assert
        expect(result.warningLevel).toBe(expectedLevel)
      })
    })


    test('should use ccusage tokenLimitStatus for warning levels', () => {
      // Arrange - ccusageのstatusフィールドを使用する
      const testCases = [
        { 
          status: 'ok', 
          expectedLevel: 'normal',
          tokens: 50000,
          limit: 140000
        },
        { 
          status: 'warning', 
          expectedLevel: 'warning',
          tokens: 98000,
          limit: 140000
        },
        { 
          status: 'exceeds', 
          expectedLevel: 'danger',
          tokens: 200000,
          limit: 140000
        }
      ]

      testCases.forEach(({ status, expectedLevel, tokens, limit }) => {
        const blockData: BlockData = {
          isActive: true,
          totalTokens: tokens,
          costUSD: 5.0,
          projection: { remainingMinutes: 120 },
          burnRate: { tokensPerMinute: 100 },
          tokenLimitStatus: {
            limit: limit,
            projectedUsage: tokens,
            percentUsed: (tokens / limit) * 100,
            status: status
          }
        }

        // Act
        const result = processor.processBlockData(blockData, limit)

        // Assert - ccusageのstatusフィールドに基づいて警告レベルが決まることを確認
        expect(result.warningLevel).toBe(expectedLevel)
      })
    })

    test('should fallback to usage-based warning when tokenLimitStatus is missing', () => {
      // Arrange - tokenLimitStatusがない場合のフォールバック
      const blockData: BlockData = {
        isActive: true,
        totalTokens: 98000, // 70% (warning level)
        costUSD: 5.0,
        projection: { remainingMinutes: 120 },
        burnRate: { tokensPerMinute: 100 }
        // tokenLimitStatus なし
      }

      // Act
      const result = processor.processBlockData(blockData, 140000)

      // Assert - 使用率ベースのフォールバック
      expect(result.warningLevel).toBe('warning')
    })

    test('should calculate block progress correctly', () => {
      // Arrange
      const testCases = [
        { remaining: 300, expected: 0 },     // 5時間（開始時点）
        { remaining: 240, expected: 20 },    // 4時間
        { remaining: 150, expected: 50 },    // 2.5時間
        { remaining: 60, expected: 80 },     // 1時間
        { remaining: 0, expected: 100 },     // 終了
      ]

      testCases.forEach(({ remaining, expected }) => {
        const blockData: BlockData = {
          isActive: true,
          totalTokens: 10000,
          costUSD: 1.0,
          projection: { remainingMinutes: remaining },
          burnRate: { tokensPerMinute: 100 }
        }

        // Act
        const result = processor.processBlockData(blockData, 140000)

        // Assert
        expect(result.blockProgress).toBeCloseTo(expected, 0)
      })
    })

    test('should include optional token counts when available', () => {
      // Arrange
      const blockData: BlockData = {
        isActive: true,
        totalTokens: 8771,
        costUSD: 10.94,
        projection: { remainingMinutes: 45 },
        burnRate: { tokensPerMinute: 250 },
        tokenCounts: {
          inputTokens: 326,
          outputTokens: 8445,
          cacheCreationInputTokens: 1166405,
          cacheReadInputTokens: 5450159
        },
        models: ['claude-sonnet', 'claude-opus'],
        entries: 67
      }

      // Act
      const result = processor.processBlockData(blockData, 140000)

      // Assert
      expect(result.tokenCounts).toBeDefined()
      expect(result.tokenCounts?.inputTokens).toBe(326)
      expect(result.tokenCounts?.outputTokens).toBe(8445)
      expect(result.models).toEqual(['claude-sonnet', 'claude-opus'])
      expect(result.entries).toBe(67)
    })

    test('should handle edge cases gracefully', () => {
      // Arrange
      const blockData: BlockData = {
        isActive: true,
        totalTokens: -100,      // Invalid negative value
        costUSD: -5,            // Invalid negative value
        projection: { remainingMinutes: -10 }, // Invalid negative value
        burnRate: { tokensPerMinute: -50 }    // Invalid negative value
      }

      // Act
      const result = processor.processBlockData(blockData, 140000)

      // Assert
      expect(result.totalTokens).toBe(0)
      expect(result.costUSD).toBe(0)
      expect(result.remainingMinutes).toBe(0)
      expect(result.burnRate).toBe(0)
      expect(result.usagePercent).toBe(0)
    })
  })

  describe('calculateCostPerHour', () => {
    test('should calculate cost per hour from burn rate', () => {
      // Arrange
      const burnRate = 1000 // tokens per minute
      const costPerToken = 0.000015 // $0.000015 per token

      // Act
      const costPerHour = processor.calculateCostPerHour(burnRate)

      // Assert
      expect(costPerHour).toBeCloseTo(0.9, 2) // 1000 * 60 * 0.000015
    })

    test('should return 0 for zero burn rate', () => {
      // Act
      const costPerHour = processor.calculateCostPerHour(0)

      // Assert
      expect(costPerHour).toBe(0)
    })
  })
})