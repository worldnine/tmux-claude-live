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
  
  // 使用率情報（制限値設定時のみ有効）
  usagePercent: number | null
  tokensRemaining: number | null
  blockProgress: number
  
  // 消費率情報
  burnRate: number
  costPerHour: number
  
  // 警告情報（制限値設定時のみ有効）
  warningLevel: 'normal' | 'warning' | 'danger' | null
  
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
  private readonly BURN_RATE_MAX = 10000  // 10k tokens/min以上は異常
  
  private lastValidValues: Map<string, number> = new Map()
  
  processBlockData(blockData: BlockData | null, tokenLimit: number | null): ProcessedData {
    // nullチェック
    if (!blockData) {
      return this.getDefaultProcessedData(tokenLimit)
    }
    
    // 値の正規化
    const totalTokens = Math.max(0, blockData.totalTokens)
    const costUSD = Math.max(0, blockData.costUSD)
    const remainingMinutes = Math.max(0, blockData.projection.remainingMinutes)
    const burnRate = this.validateAndCorrectBurnRate(blockData.burnRate.tokensPerMinute)
    
    // セッション残り時間の計算
    const sessionRemainingMinutes = this.calculateSessionRemainingMinutes(blockData)
    const sessionRemainingSeconds = sessionRemainingMinutes * 60
    
    // ccusageのtokenLimitStatusを優先使用、なければ独自計算
    let usagePercent: number | null = null
    let tokensRemaining: number | null = null
    let warningLevel: 'normal' | 'warning' | 'danger' | null = null
    
    if (blockData.tokenLimitStatus) {
      // ccusageから制限値情報が取得できた場合、実際のtotalTokensで計算
      usagePercent = (totalTokens / blockData.tokenLimitStatus.limit) * 100
      tokensRemaining = Math.max(0, blockData.tokenLimitStatus.limit - totalTokens)
      // 実際の使用率に基づいて警告レベルを決定（ccusageのstatusは無視）
      warningLevel = this.determineWarningLevel(usagePercent)
    } else if (tokenLimit) {
      // フォールバック：独自計算
      usagePercent = (totalTokens / tokenLimit) * 100
      tokensRemaining = Math.max(0, tokenLimit - totalTokens)
      warningLevel = this.determineWarningLevel(usagePercent)
    }
    
    const remainingSeconds = remainingMinutes * 60
    const elapsedMinutes = this.BLOCK_DURATION_MINUTES - remainingMinutes
    const blockProgress = Math.min(100, Math.max(0, (elapsedMinutes / this.BLOCK_DURATION_MINUTES) * 100))
    const costPerHour = this.calculateCostPerHour(burnRate)
    
    return {
      isActive: blockData.isActive,
      totalTokens,
      costUSD,
      remainingMinutes,
      remainingSeconds,
      sessionRemainingMinutes,
      sessionRemainingSeconds,
      usagePercent: usagePercent !== null ? Math.round(usagePercent * 100) / 100 : null,
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
  
  private determineWarningLevel(usagePercent: number): 'normal' | 'warning' | 'danger' {
    // 使用率のみで判定（残り時間は考慮しない）
    if (usagePercent >= 90) {
      return 'danger'
    } else if (usagePercent >= 70) {
      return 'warning'
    } else {
      return 'normal'
    }
  }
  
  /**
   * ccusageのstatus文字列を警告レベルにマップ
   */
  private mapCcusageStatusToWarningLevel(status: string): 'normal' | 'warning' | 'danger' {
    switch (status.toLowerCase()) {
      case 'exceeds':
      case 'danger':
        return 'danger'
      case 'warning':
      case 'high':
        return 'warning'
      case 'ok':
      case 'normal':
      case 'good':
      default:
        return 'normal'
    }
  }
  
  private getDefaultProcessedData(tokenLimit: number | null): ProcessedData {
    return {
      isActive: false,
      totalTokens: 0,
      costUSD: 0,
      remainingMinutes: 0,
      remainingSeconds: 0,
      sessionRemainingMinutes: 0,
      sessionRemainingSeconds: 0,
      usagePercent: tokenLimit ? 0 : null,
      tokensRemaining: tokenLimit ? tokenLimit : null,
      blockProgress: 0,
      burnRate: 0,
      costPerHour: 0,
      warningLevel: tokenLimit ? 'normal' : null
    }
  }
  
  /**
   * バーンレートの妥当性を検証し、異常値を補正する
   */
  validateAndCorrectBurnRate(burnRate: number): number {
    // 数値の妥当性チェック
    if (!Number.isFinite(burnRate)) {
      console.warn('Abnormal burn rate detected (not finite):', burnRate)
      return this.getLastValidBurnRate()
    }
    
    // 負の値チェック
    if (burnRate < 0) {
      console.warn('Abnormal burn rate detected (negative):', burnRate)
      return this.getLastValidBurnRate()
    }
    
    // 上限チェック
    if (burnRate > this.BURN_RATE_MAX) {
      console.warn('Abnormal burn rate detected (too high):', burnRate)
      return this.getLastValidBurnRate()
    }
    
    // 正常値を記録して返す
    this.lastValidValues.set('burnRate', burnRate)
    return burnRate
  }
  
  private getLastValidBurnRate(): number {
    const lastValid = this.lastValidValues.get('burnRate')
    if (lastValid !== undefined) {
      console.info('Using last valid burn rate:', lastValid)
      return lastValid
    }
    console.info('No last valid burn rate available, returning 0')
    return 0
  }
}