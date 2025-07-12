import type { BlockData } from './CcusageClient'

export interface ProcessedData {
  // 基本情報
  isActive: boolean
  totalTokens: number
  costUSD: number
  
  // 時間情報
  remainingMinutes: number
  remainingSeconds: number
  sessionRemainingMinutes: number
  sessionRemainingSeconds: number
  
  // 使用率情報
  usagePercent: number
  tokensRemaining: number
  blockProgress: number
  
  // 消費率情報
  burnRate: number
  costPerHour: number
  
  // 警告情報
  warningLevel: 'normal' | 'warning' | 'danger'
  
  // オプション情報
  tokenCounts?: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens?: number
    cacheReadInputTokens?: number
  }
  models?: string[]
  entries?: number
}

export class DataProcessor {
  private readonly COST_PER_TOKEN = 0.000015  // $0.000015 per token
  private readonly BLOCK_DURATION_MINUTES = 300  // 5時間 = 300分
  
  processBlockData(blockData: BlockData | null, tokenLimit: number): ProcessedData {
    // nullチェック
    if (!blockData) {
      return this.getDefaultProcessedData(tokenLimit)
    }
    
    // 値の正規化
    const totalTokens = Math.max(0, blockData.totalTokens)
    const costUSD = Math.max(0, blockData.costUSD)
    const remainingMinutes = Math.max(0, blockData.projection.remainingMinutes)
    const burnRate = Math.max(0, blockData.burnRate.tokensPerMinute)
    
    // セッション残り時間の計算
    const sessionRemainingMinutes = this.calculateSessionRemainingMinutes(blockData)
    const sessionRemainingSeconds = sessionRemainingMinutes * 60
    
    // 計算
    const usagePercent = (totalTokens / tokenLimit) * 100
    const tokensRemaining = Math.max(0, tokenLimit - totalTokens)
    const remainingSeconds = remainingMinutes * 60
    const elapsedMinutes = this.BLOCK_DURATION_MINUTES - remainingMinutes
    const blockProgress = Math.min(100, Math.max(0, (elapsedMinutes / this.BLOCK_DURATION_MINUTES) * 100))
    const costPerHour = this.calculateCostPerHour(burnRate)
    
    // 警告レベル判定
    const warningLevel = this.determineWarningLevel(usagePercent, remainingMinutes)
    
    return {
      isActive: blockData.isActive,
      totalTokens,
      costUSD,
      remainingMinutes,
      remainingSeconds,
      sessionRemainingMinutes,
      sessionRemainingSeconds,
      usagePercent: Math.round(usagePercent * 100) / 100,  // 小数点2桁
      tokensRemaining,
      blockProgress: Math.round(blockProgress),
      burnRate,
      costPerHour,
      warningLevel,
      tokenCounts: blockData.tokenCounts,
      models: blockData.models,
      entries: blockData.entries
    }
  }
  
  calculateCostPerHour(burnRate: number): number {
    if (burnRate <= 0) return 0
    return burnRate * 60 * this.COST_PER_TOKEN
  }
  
  calculateSessionRemainingMinutes(blockData: BlockData): number {
    // セッションの終了時間が存在しない場合は0を返す
    if (!blockData.endTime) {
      return 0
    }
    
    try {
      const endTime = new Date(blockData.endTime)
      const now = new Date()
      
      // 現在時刻がセッション終了時刻を過ぎている場合は0
      if (now >= endTime) {
        return 0
      }
      
      // 残り時間を分単位で計算
      const remainingMs = endTime.getTime() - now.getTime()
      const remainingMinutes = Math.floor(remainingMs / (1000 * 60))
      
      return Math.max(0, remainingMinutes)
    } catch (error) {
      // 日付パースエラーの場合は0を返す
      return 0
    }
  }
  
  private determineWarningLevel(usagePercent: number, remainingMinutes: number): 'normal' | 'warning' | 'danger' {
    // 使用率ベース
    let usageLevel: 'normal' | 'warning' | 'danger' = 'normal'
    if (usagePercent >= 90) {
      usageLevel = 'danger'
    } else if (usagePercent >= 70) {
      usageLevel = 'warning'
    }
    
    // 時間ベース
    let timeLevel: 'normal' | 'warning' | 'danger' = 'normal'
    if (remainingMinutes < 30) {
      timeLevel = 'danger'
    } else if (remainingMinutes <= 60) {
      timeLevel = 'warning'
    }
    
    // より厳しい方を採用
    if (usageLevel === 'danger' || timeLevel === 'danger') return 'danger'
    if (usageLevel === 'warning' || timeLevel === 'warning') return 'warning'
    return 'normal'
  }
  
  private getDefaultProcessedData(tokenLimit: number): ProcessedData {
    return {
      isActive: false,
      totalTokens: 0,
      costUSD: 0,
      remainingMinutes: 0,
      remainingSeconds: 0,
      sessionRemainingMinutes: 0,
      sessionRemainingSeconds: 0,
      usagePercent: 0,
      tokensRemaining: tokenLimit,
      blockProgress: 0,
      burnRate: 0,
      costPerHour: 0,
      warningLevel: 'normal'
    }
  }
}