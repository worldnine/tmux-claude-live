import type { CommandExecutor } from '../utils/CommandExecutor'
import { RealCommandExecutor } from '../utils/CommandExecutor'

export interface TokenLimitStatus {
  limit: number
  projectedUsage: number
  percentUsed: number
  status: string
}

export interface BlockData {
  isActive: boolean
  totalTokens: number
  costUSD: number
  projection: {
    remainingMinutes: number
  }
  burnRate: {
    tokensPerMinute: number
  }
  tokenCounts?: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
  }
  models?: string[]
  entries?: number
  startTime?: string
  endTime?: string
  tokenLimitStatus?: TokenLimitStatus
}

export class CcusageClient {
  private readonly COMMAND_TIMEOUT = 5000 // 5秒

  constructor(private executor: CommandExecutor = new RealCommandExecutor()) {}

  async getActiveBlock(tokenLimit?: number): Promise<BlockData | null> {
    try {
      let command = 'ccusage blocks --active --json'
      if (tokenLimit && tokenLimit > 0) {
        command += ` --token-limit ${tokenLimit}`
      }
      
      const output = this.executor.execute(command, {
        timeout: this.COMMAND_TIMEOUT
      })
      
      const data = JSON.parse(output)
      return this.transformToBlockData(data)
    } catch (error) {
      return null
    }
  }

  async getAllBlocks(): Promise<BlockData[]> {
    try {
      const output = this.executor.execute('ccusage blocks --json', {
        timeout: this.COMMAND_TIMEOUT
      })
      
      const data = JSON.parse(output)
      if (!data.blocks || !Array.isArray(data.blocks)) {
        return []
      }

      return data.blocks
        .map((block: any) => this.transformSingleBlock(block))
        .filter((block: BlockData | null): block is BlockData => block !== null)
    } catch (error) {
      return []
    }
  }
  
  private transformToBlockData(data: any): BlockData | null {
    if (!data.blocks || data.blocks.length === 0) {
      return null
    }
    
    return this.transformSingleBlock(data.blocks[0])
  }

  private transformSingleBlock(block: any): BlockData | null {
    // 必須フィールドの検証
    if (
      typeof block.isActive !== 'boolean' ||
      typeof block.totalTokens !== 'number' ||
      typeof block.costUSD !== 'number' ||
      !block.projection ||
      typeof block.projection.remainingMinutes !== 'number' ||
      !block.burnRate ||
      typeof block.burnRate.tokensPerMinute !== 'number'
    ) {
      return null
    }
    
    return {
      isActive: block.isActive,
      totalTokens: block.totalTokens,
      costUSD: block.costUSD,
      projection: {
        remainingMinutes: block.projection.remainingMinutes
      },
      burnRate: {
        tokensPerMinute: block.burnRate.tokensPerMinute
      },
      tokenCounts: block.tokenCounts,
      models: block.models,
      entries: block.entries,
      startTime: block.startTime,
      endTime: block.endTime,
      tokenLimitStatus: block.tokenLimitStatus
    }
  }
}