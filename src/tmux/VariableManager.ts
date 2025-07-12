import type { ProcessedData } from '../core/DataProcessor'
import type { Config } from '../core/ConfigManager'
import type { CommandExecutor } from '../utils/CommandExecutor'
import { RealCommandExecutor } from '../utils/CommandExecutor'
import { TimeFormatter } from '../formatters/TimeFormatter'
import { TokenFormatter } from '../formatters/TokenFormatter'
import { CostFormatter } from '../formatters/CostFormatter'
import { ColorResolver } from './ColorResolver'

export class VariableManager {
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

    // 個別に実行する方法に変更（より確実）
    for (const [name, value] of entries) {
      this.setVariable(name, value)
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
    variables['usage_percent'] = `${data.usagePercent.toFixed(2)}%`
    variables['tokens_remaining'] = data.tokensRemaining.toString()
    variables['burn_rate'] = data.burnRate.toString()
    variables['cost_per_hour'] = CostFormatter.format(data.costPerHour, config.displayFormats.cost)

    // フォーマット済みデータの設定
    variables['total_tokens_formatted'] = TokenFormatter.format(data.totalTokens, config.displayFormats.token)
    variables['tokens_remaining_formatted'] = TokenFormatter.format(data.tokensRemaining, config.displayFormats.token)
    variables['token_limit_formatted'] = TokenFormatter.format(config.tokenLimit, config.displayFormats.token)

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
    variables['burn_rate_formatted'] = `${data.burnRate}/min`

    return variables
  }
}