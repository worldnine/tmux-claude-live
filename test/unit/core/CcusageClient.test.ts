import { describe, expect, test, beforeEach } from 'vitest'
import { CcusageClient } from '../../../src/core/CcusageClient'
import type { BlockData } from '../../../src/core/CcusageClient'
import { MockCommandExecutor } from '../../../src/utils/CommandExecutor'

describe('CcusageClient', () => {
  let client: CcusageClient
  let mockExecutor: MockCommandExecutor

  beforeEach(() => {
    mockExecutor = new MockCommandExecutor()
    client = new CcusageClient(mockExecutor)
  })

  describe('getActiveBlock', () => {
    test('should get active block data', async () => {
      // Arrange
      const mockResponse = {
        blocks: [
          {
            isActive: true,
            totalTokens: 8771,
            costUSD: 10.94,
            projection: {
              remainingMinutes: 45
            },
            burnRate: {
              tokensPerMinute: 250
            }
          }
        ]
      }

      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockResponse))

      // Act
      const blockData = await client.getActiveBlock()

      // Assert
      expect(blockData).toBeDefined()
      expect(blockData?.isActive).toBe(true)
      expect(blockData?.totalTokens).toBe(8771)
      expect(blockData?.costUSD).toBe(10.94)
      expect(blockData?.projection).toBeDefined()
      expect(blockData?.projection.remainingMinutes).toBe(45)
      expect(blockData?.burnRate).toBeDefined()
      expect(blockData?.burnRate.tokensPerMinute).toBe(250)
    })

    test('should return null when no active block exists', async () => {
      // Arrange
      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify({ blocks: [] }))

      // Act
      const blockData = await client.getActiveBlock()

      // Assert
      expect(blockData).toBeNull()
    })

    test('should return null when ccusage command fails', async () => {
      // Arrange
      mockExecutor.setError('ccusage blocks --active --json', new Error('command not found: ccusage'))

      // Act
      const blockData = await client.getActiveBlock()

      // Assert
      expect(blockData).toBeNull()
    })

    test('should parse token counts correctly', async () => {
      // Arrange
      const mockResponse = {
        blocks: [
          {
            isActive: true,
            totalTokens: 8771,
            costUSD: 10.94,
            tokenCounts: {
              inputTokens: 326,
              outputTokens: 8445,
              cacheCreationInputTokens: 1166405,
              cacheReadInputTokens: 5450159
            },
            projection: {
              remainingMinutes: 4
            },
            burnRate: {
              tokensPerMinute: 22728.839
            }
          }
        ]
      }

      mockExecutor.setResponse('ccusage blocks --active --json', JSON.stringify(mockResponse))

      // Act
      const blockData = await client.getActiveBlock()

      // Assert
      expect(blockData).toBeDefined()
      expect(blockData?.tokenCounts).toBeDefined()
      expect(blockData?.tokenCounts?.inputTokens).toBe(326)
      expect(blockData?.tokenCounts?.outputTokens).toBe(8445)
    })

    test('should handle malformed JSON gracefully', async () => {
      // Arrange
      mockExecutor.setResponse('ccusage blocks --active --json', 'invalid json')

      // Act
      const blockData = await client.getActiveBlock()

      // Assert
      expect(blockData).toBeNull()
    })

    test('should include token-limit option when provided', async () => {
      // Arrange
      const mockResponse = {
        blocks: [{
          isActive: true,
          totalTokens: 8771,
          costUSD: 10.94,
          projection: { remainingMinutes: 45 },
          burnRate: { tokensPerMinute: 250 },
          tokenLimitStatus: {
            limit: 100000,
            projectedUsage: 8771,
            percentUsed: 8.77,
            status: 'ok'
          }
        }]
      }
      mockExecutor.setResponse('ccusage blocks --active --json --token-limit 100000', JSON.stringify(mockResponse))

      // Act
      const result = await client.getActiveBlock(100000)

      // Assert
      expect(result).toBeDefined()
      expect(result?.tokenLimitStatus).toBeDefined()
      expect(result?.tokenLimitStatus?.status).toBe('ok')
      expect(result?.tokenLimitStatus?.limit).toBe(100000)
      expect(mockExecutor.wasCommandExecuted('ccusage blocks --active --json --token-limit 100000')).toBe(true)
    })
  })

  describe('getAllBlocks', () => {
    test('should get all blocks data', async () => {
      // Arrange
      const mockResponse = {
        blocks: [
          {
            isActive: true,
            totalTokens: 8771,
            costUSD: 10.94,
            projection: {
              remainingMinutes: 45
            },
            burnRate: {
              tokensPerMinute: 250
            }
          },
          {
            isActive: false,
            totalTokens: 5000,
            costUSD: 5.50,
            projection: {
              remainingMinutes: 0
            },
            burnRate: {
              tokensPerMinute: 100
            }
          }
        ]
      }

      mockExecutor.setResponse('ccusage blocks --json', JSON.stringify(mockResponse))

      // Act
      const blocks = await client.getAllBlocks()

      // Assert
      expect(blocks).toBeDefined()
      expect(Array.isArray(blocks)).toBe(true)
      expect(blocks).toHaveLength(2)
      expect(blocks[0].totalTokens).toBe(8771)
      expect(blocks[1].totalTokens).toBe(5000)
    })

    test('should return empty array when ccusage fails', async () => {
      // Arrange
      mockExecutor.setError('ccusage blocks --json', new Error('command not found: ccusage'))

      // Act
      const blocks = await client.getAllBlocks()

      // Assert
      expect(blocks).toEqual([])
    })
  })
})