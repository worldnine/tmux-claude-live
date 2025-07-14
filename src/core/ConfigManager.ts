import type { CommandExecutor } from '../utils/CommandExecutor'
import { RealCommandExecutor } from '../utils/CommandExecutor'

export interface Config {
  updateInterval: number
  tokenLimit: number
  warningThresholds: {
    usage: [number, number]
    time: [number, number]
  }
  displayFormats: {
    time: 'compact' | 'verbose' | 'short'
    cost: 'currency' | 'number' | 'compact'
    token: 'compact' | 'full' | 'short'
  }
}

export class ConfigManager {
  private readonly DEFAULT_CONFIG: Config = {
    updateInterval: 10, // 5秒→10秒に変更（負荷軽減）
    tokenLimit: 140000,
    warningThresholds: {
      usage: [70, 90],
      time: [60, 30]
    },
    displayFormats: {
      time: 'compact',
      cost: 'currency',
      token: 'compact'
    }
  }

  constructor(private executor: CommandExecutor = new RealCommandExecutor()) {}

  loadConfig(): Config {
    const config = { ...this.DEFAULT_CONFIG }
    
    // 更新間隔
    const updateInterval = this.getTmuxOption('@ccusage_update_interval')
    if (updateInterval !== null) {
      const value = parseInt(updateInterval)
      if (!isNaN(value) && value > 0 && value <= 3600) {
        config.updateInterval = value
      }
    }
    
    // トークン制限
    const tokenLimit = this.getTmuxOption('@ccusage_token_limit')
    if (tokenLimit !== null) {
      const value = parseInt(tokenLimit)
      if (!isNaN(value) && value >= 1000) {
        config.tokenLimit = value
      }
    }
    
    // 警告しきい値
    const warningThreshold1 = this.getTmuxOption('@ccusage_warning_threshold_1')
    const warningThreshold2 = this.getTmuxOption('@ccusage_warning_threshold_2')
    if (warningThreshold1 !== null && warningThreshold2 !== null) {
      const v1 = parseInt(warningThreshold1)
      const v2 = parseInt(warningThreshold2)
      if (!isNaN(v1) && !isNaN(v2) && v1 >= 0 && v1 <= 100 && v2 >= 0 && v2 <= 100 && v1 < v2) {
        config.warningThresholds.usage = [v1, v2]
      }
    }
    
    // 時間警告しきい値
    const timeWarning1 = this.getTmuxOption('@ccusage_time_warning_1')
    const timeWarning2 = this.getTmuxOption('@ccusage_time_warning_2')
    if (timeWarning1 !== null && timeWarning2 !== null) {
      const v1 = parseInt(timeWarning1)
      const v2 = parseInt(timeWarning2)
      if (!isNaN(v1) && !isNaN(v2) && v1 >= 0 && v2 >= 0 && v1 > v2) {
        config.warningThresholds.time = [v1, v2]
      }
    }
    
    // 表示形式
    const timeFormat = this.getTmuxOption('@ccusage_time_format')
    if (timeFormat && this.isValidTimeFormat(timeFormat)) {
      config.displayFormats.time = timeFormat
    }
    
    const costFormat = this.getTmuxOption('@ccusage_cost_format')
    if (costFormat && this.isValidCostFormat(costFormat)) {
      config.displayFormats.cost = costFormat
    }
    
    const tokenFormat = this.getTmuxOption('@ccusage_token_format')
    if (tokenFormat && this.isValidTokenFormat(tokenFormat)) {
      config.displayFormats.token = tokenFormat
    }
    
    return config
  }
  
  getDefault(): Config {
    return { ...this.DEFAULT_CONFIG }
  }
  
  validateConfig(config: Config): boolean {
    // 基本的な型チェック
    if (typeof config.updateInterval !== 'number' || config.updateInterval < 1) {
      return false
    }
    
    if (typeof config.tokenLimit !== 'number' || config.tokenLimit < 1000) {
      return false
    }
    
    // 警告しきい値チェック
    if (!Array.isArray(config.warningThresholds.usage) || 
        config.warningThresholds.usage.length !== 2) {
      return false
    }
    
    if (!Array.isArray(config.warningThresholds.time) || 
        config.warningThresholds.time.length !== 2) {
      return false
    }
    
    // 表示形式チェック
    if (!this.isValidTimeFormat(config.displayFormats.time)) {
      return false
    }
    
    if (!this.isValidCostFormat(config.displayFormats.cost)) {
      return false
    }
    
    if (!this.isValidTokenFormat(config.displayFormats.token)) {
      return false
    }
    
    return true
  }
  
  private getTmuxOption(option: string): string | null {
    try {
      const result = this.executor.execute(`tmux show-option -gqv "${option}"`)
      const trimmed = result.trim()
      return trimmed || null
    } catch (error) {
      return null
    }
  }
  
  private isValidTimeFormat(format: string): format is 'compact' | 'verbose' | 'short' {
    return ['compact', 'verbose', 'short'].includes(format)
  }
  
  private isValidCostFormat(format: string): format is 'currency' | 'number' | 'compact' {
    return ['currency', 'number', 'compact'].includes(format)
  }
  
  private isValidTokenFormat(format: string): format is 'compact' | 'full' | 'short' {
    return ['compact', 'full', 'short'].includes(format)
  }
}