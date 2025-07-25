import type { ProcessedData } from '../core/DataProcessor'
import type { Config } from '../core/ConfigManager'
import type { CommandExecutor } from '../utils/CommandExecutor'
import { RealCommandExecutor } from '../utils/CommandExecutor'
import { TimeFormatter } from '../formatters/TimeFormatter'
import { TokenFormatter } from '../formatters/TokenFormatter'
import { CostFormatter } from '../formatters/CostFormatter'
import { ColorResolver } from './ColorResolver'

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  isHealthy: boolean
  issues: string[]
  metrics: {
    uptimeHours: number
    errorRate: number
    memoryUsageMB: number
  }
  lastSelfHealTime: Date | null
}

export class VariableManager {
  private lastVariables: Record<string, string> = {}
  
  constructor(private executor: CommandExecutor = new RealCommandExecutor()) {}

  setVariable(name: string, value: string): void {
    try {
      // $記号をエスケープして変数展開を防ぐ
      const escapedValue = value.replace(/\$/g, '\\$')
      this.executor.execute(`tmux set-option -g @ccusage_${name} "${escapedValue}"`)
    } catch (error) {
      // サイレントに失敗 - ログ出力は行うが例外は投げない
      console.error(`Failed to set tmux variable: ccusage_${name}`, error)
    }
  }

  getVariable(name: string): string | null {
    try {
      const output = this.executor.execute(`tmux show-option -gqv @ccusage_${name}`)
      const trimmed = output.trim()
      return trimmed === '' ? null : trimmed
    } catch (error) {
      return null
    }
  }

  removeVariable(name: string): void {
    try {
      this.executor.execute(`tmux set-option -gu @ccusage_${name}`)
    } catch (error) {
      // サイレントに失敗
      console.error(`Failed to remove tmux variable: ccusage_${name}`, error)
    }
  }

  setBulkVariables(variables: Record<string, string>): void {
    const entries = Object.entries(variables)
    if (entries.length === 0) {
      return
    }

    // 差分更新を実行
    const changedEntries = this.getChangedVariables(variables)
    
    if (changedEntries.length === 0) {
      // 変更がない場合はスキップ
      return
    }

    console.log(`[DiffUpdate] Updating ${changedEntries.length} of ${entries.length} variables`)

    // 一括設定用のスクリプトを生成（変更された変数のみ）
    const commands = changedEntries.map(([name, value]) => {
      const escapedValue = value.replace(/\$/g, '\\$').replace(/"/g, '\\"')
      return `set-option -g @ccusage_${name} "${escapedValue}"`
    })

    try {
      // すべてのコマンドを一つのtmux呼び出しで実行（原子性確保）
      const combinedCommand = commands.join(' \\; ')
      this.executor.execute(`tmux ${combinedCommand}`, { timeout: 30000 })
      
      // 成功したら最新の変数を記録
      this.lastVariables = { ...variables }
    } catch (error) {
      // 一括設定が失敗した場合は個別に設定（フォールバック）
      console.warn('Bulk variable setting failed, falling back to individual setting:', error)
      for (const [name, value] of changedEntries) {
        this.setVariable(name, value)
      }
      
      // 個別設定成功後も最新の変数を記録
      this.lastVariables = { ...variables }
    }
  }

  /**
   * 変更された変数のみを取得
   */
  private getChangedVariables(newVariables: Record<string, string>): [string, string][] {
    const changed: [string, string][] = []
    
    for (const [name, value] of Object.entries(newVariables)) {
      if (this.lastVariables[name] !== value) {
        changed.push([name, value])
      }
    }
    
    return changed
  }

  /**
   * 強制全更新（差分更新をスキップ）
   */
  setBulkVariablesForced(variables: Record<string, string>): void {
    const entries = Object.entries(variables)
    if (entries.length === 0) {
      return
    }

    console.log(`[ForceUpdate] Updating all ${entries.length} variables`)

    // 一括設定用のスクリプトを生成
    const commands = entries.map(([name, value]) => {
      const escapedValue = value.replace(/\$/g, '\\$').replace(/"/g, '\\"')
      return `set-option -g @ccusage_${name} "${escapedValue}"`
    })

    try {
      // すべてのコマンドを一つのtmux呼び出しで実行（原子性確保）
      const combinedCommand = commands.join(' \\; ')
      this.executor.execute(`tmux ${combinedCommand}`, { timeout: 30000 })
      
      // 成功したら最新の変数を記録
      this.lastVariables = { ...variables }
    } catch (error) {
      // 一括設定が失敗した場合は個別に設定（フォールバック）
      console.warn('Bulk variable setting failed, falling back to individual setting:', error)
      for (const [name, value] of entries) {
        this.setVariable(name, value)
      }
      
      // 個別設定成功後も最新の変数を記録
      this.lastVariables = { ...variables }
    }
  }

  getAllVariables(): Record<string, string> {
    try {
      const output = this.executor.execute('tmux show-options -g')
      const lines = output.split('\n')
      const variables: Record<string, string> = {}

      for (const line of lines) {
        const match = line.match(/^@ccusage_(.+?)\s+(.+)$/)
        if (match) {
          const [, name, value] = match
          variables[name] = value
        }
      }

      return variables
    } catch (error) {
      return {}
    }
  }

  clearAllVariables(): void {
    const currentVariables = this.getAllVariables()
    const variableNames = Object.keys(currentVariables)

    if (variableNames.length === 0) {
      return
    }

    // 個別に削除する方法に変更（より確実）
    for (const name of variableNames) {
      this.removeVariable(name)
    }
  }

  variableExists(name: string): boolean {
    return this.getVariable(name) !== null
  }

  generateVariableMap(data: ProcessedData, config: Config): Record<string, string> {
    const variables: Record<string, string> = {}

    // 基本データの設定
    variables['is_active'] = data.isActive.toString()
    variables['total_tokens'] = data.totalTokens.toString()
    variables['cost_current'] = CostFormatter.format(data.costUSD, config.displayFormats.cost)
    variables['time_remaining'] = TimeFormatter.format(data.remainingMinutes, config.displayFormats.time)
    variables['session_time_remaining'] = TimeFormatter.format(data.sessionRemainingMinutes, config.displayFormats.time)

    // 計算データの設定
    variables['usage_percent'] = data.usagePercent !== null ? `${data.usagePercent.toFixed(2)}%` : 'N/A'
    variables['tokens_remaining'] = data.tokensRemaining !== null ? data.tokensRemaining.toString() : 'N/A'
    variables['burn_rate'] = data.burnRate.toFixed(1)
    variables['cost_per_hour'] = CostFormatter.format(data.costPerHour, config.displayFormats.cost)

    // フォーマット済みデータの設定
    variables['total_tokens_formatted'] = TokenFormatter.format(data.totalTokens, config.displayFormats.token)
    variables['tokens_remaining_formatted'] = data.tokensRemaining !== null ? TokenFormatter.format(data.tokensRemaining, config.displayFormats.token) : 'N/A'
    variables['token_limit_formatted'] = config.tokenLimit !== null ? TokenFormatter.format(config.tokenLimit, config.displayFormats.token) : 'N/A'

    // メタデータの設定
    variables['warning_level'] = data.warningLevel
    const warningColor = ColorResolver.resolveColorFromProcessedData(data)
    variables['warning_color'] = warningColor
    variables['warning_color_name'] = ColorResolver.getColorName(warningColor)

    // 追加データの設定
    variables['block_progress'] = data.blockProgress.toString()
    variables['block_progress_percent'] = `${data.blockProgress}%`
    variables['remaining_seconds'] = data.remainingSeconds.toString()
    variables['session_remaining_seconds'] = data.sessionRemainingSeconds.toString()
    variables['token_limit'] = config.tokenLimit.toString()
    variables['burn_rate_formatted'] = TokenFormatter.formatWithUnit(data.burnRate, '/min')

    return variables
  }

  /**
   * ヘルス状態のtmux変数を生成
   */
  generateHealthVariables(healthStatus: HealthStatus): Record<string, string> {
    const variables: Record<string, string> = {}

    // 基本的なヘルス状態
    variables['daemon_health'] = healthStatus.status
    variables['daemon_health_is_healthy'] = healthStatus.isHealthy.toString()
    
    // メトリクス
    variables['daemon_uptime'] = TimeFormatter.formatHours(healthStatus.metrics.uptimeHours)
    variables['daemon_uptime_hours'] = healthStatus.metrics.uptimeHours.toString()
    variables['error_rate'] = `${healthStatus.metrics.errorRate.toFixed(1)}%`
    variables['memory_usage'] = `${healthStatus.metrics.memoryUsageMB.toFixed(1)}MB`
    
    // 最後の自己修復時刻
    variables['last_self_heal'] = healthStatus.lastSelfHealTime 
      ? healthStatus.lastSelfHealTime.toISOString().slice(0, 19).replace('T', ' ')
      : 'Never'
    
    // 問題の要約（最初の3つまで）
    const issuesSummary = healthStatus.issues.length > 0 
      ? healthStatus.issues.slice(0, 3).join('; ')
      : 'None'
    variables['health_issues'] = issuesSummary

    return variables
  }

  /**
   * 通常の変数とヘルス変数を統合
   */
  generateVariableMapWithHealth(data: ProcessedData, config: Config, healthStatus?: HealthStatus): Record<string, string> {
    const variables = this.generateVariableMap(data, config)
    
    if (healthStatus) {
      const healthVariables = this.generateHealthVariables(healthStatus)
      Object.assign(variables, healthVariables)
    }
    
    return variables
  }
}