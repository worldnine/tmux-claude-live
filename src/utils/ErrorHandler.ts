import { logger } from './Logger'

export enum ErrorType {
  CCUSAGE_NOT_FOUND = 'ccusage_not_found',
  CCUSAGE_TIMEOUT = 'ccusage_timeout',
  CCUSAGE_PARSE_ERROR = 'ccusage_parse_error',
  TMUX_NOT_FOUND = 'tmux_not_found',
  TMUX_NO_SESSION = 'tmux_no_session',
  TMUX_PERMISSION_ERROR = 'tmux_permission_error',
  CONFIG_ERROR = 'config_error',
  NETWORK_ERROR = 'network_error',
  UNKNOWN_ERROR = 'unknown_error'
}

export interface ErrorContext {
  command?: string
  output?: string
  attemptCount?: number
  lastAttemptTime?: Date
  recoveryAction?: string
}

export interface RecoveryStrategy {
  maxAttempts: number
  backoffMs: number
  fallbackAction: () => Promise<void>
}

export class ErrorHandler {
  private static instance: ErrorHandler
  private errorCounts: Map<ErrorType, number> = new Map()
  private lastErrorTimes: Map<ErrorType, Date> = new Map()
  private recoveryStrategies: Map<ErrorType, RecoveryStrategy> = new Map()

  private constructor() {
    this.setupDefaultStrategies()
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler()
    }
    return ErrorHandler.instance
  }

  private setupDefaultStrategies(): void {
    // ccusage not found - 設定確認を促す
    this.recoveryStrategies.set(ErrorType.CCUSAGE_NOT_FOUND, {
      maxAttempts: 3,
      backoffMs: 5000,
      fallbackAction: async () => {
        logger.warn('ccusage command not found. Please install ccusage: npm install -g ccusage')
        // デフォルト値でtmux変数を設定
        await this.setDefaultVariables()
      }
    })

    // ccusage timeout - リトライ後フォールバック
    this.recoveryStrategies.set(ErrorType.CCUSAGE_TIMEOUT, {
      maxAttempts: 2,
      backoffMs: 2000,
      fallbackAction: async () => {
        logger.warn('ccusage command timeout. Using cached or default values.')
        await this.setDefaultVariables()
      }
    })

    // tmux not found - 設定確認を促す
    this.recoveryStrategies.set(ErrorType.TMUX_NOT_FOUND, {
      maxAttempts: 1,
      backoffMs: 0,
      fallbackAction: async () => {
        logger.error('tmux not found. Please install tmux.')
        // ログのみ出力、継続不可
      }
    })

    // tmux no session - セッション作成を促す
    this.recoveryStrategies.set(ErrorType.TMUX_NO_SESSION, {
      maxAttempts: 1,
      backoffMs: 0,
      fallbackAction: async () => {
        logger.warn('No tmux session found. Please start a tmux session.')
        // ログのみ出力、継続可能
      }
    })

    // 設定エラー - デフォルト値を使用
    this.recoveryStrategies.set(ErrorType.CONFIG_ERROR, {
      maxAttempts: 1,
      backoffMs: 0,
      fallbackAction: async () => {
        logger.warn('Configuration error. Using default values.')
      }
    })

    // 未知のエラー - ログ出力のみ
    this.recoveryStrategies.set(ErrorType.UNKNOWN_ERROR, {
      maxAttempts: 1,
      backoffMs: 1000,
      fallbackAction: async () => {
        logger.error('Unknown error occurred. Continuing with default behavior.')
      }
    })
  }

  classifyError(error: Error, context?: ErrorContext): ErrorType {
    const message = error.message.toLowerCase()
    
    if (message.includes('command not found') && context?.command?.includes('ccusage')) {
      return ErrorType.CCUSAGE_NOT_FOUND
    }
    
    if (message.includes('timeout') && context?.command?.includes('ccusage')) {
      return ErrorType.CCUSAGE_TIMEOUT
    }
    
    if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
      return ErrorType.CCUSAGE_PARSE_ERROR
    }
    
    if (message.includes('command not found') && context?.command?.includes('tmux')) {
      return ErrorType.TMUX_NOT_FOUND
    }
    
    if (message.includes('no server running') || message.includes('no session')) {
      return ErrorType.TMUX_NO_SESSION
    }
    
    if (message.includes('permission denied') || message.includes('access denied')) {
      return ErrorType.TMUX_PERMISSION_ERROR
    }
    
    if (message.includes('config') || message.includes('setting')) {
      return ErrorType.CONFIG_ERROR
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return ErrorType.NETWORK_ERROR
    }
    
    return ErrorType.UNKNOWN_ERROR
  }

  async handleError(error: Error, context?: ErrorContext): Promise<boolean> {
    const errorType = this.classifyError(error, context)
    
    // エラー統計を更新
    this.updateErrorStats(errorType)
    
    // ログ出力
    logger.error(`Error occurred: ${errorType}`, error, {
      ...context,
      errorCount: this.errorCounts.get(errorType) || 0
    })
    
    // 回復戦略を実行
    return await this.executeRecoveryStrategy(errorType, error, context)
  }

  private updateErrorStats(errorType: ErrorType): void {
    const currentCount = this.errorCounts.get(errorType) || 0
    this.errorCounts.set(errorType, currentCount + 1)
    this.lastErrorTimes.set(errorType, new Date())
  }

  private async executeRecoveryStrategy(
    errorType: ErrorType, 
    error: Error, 
    context?: ErrorContext
  ): Promise<boolean> {
    const strategy = this.recoveryStrategies.get(errorType)
    if (!strategy) {
      logger.error(`No recovery strategy found for error type: ${errorType}`)
      return false
    }

    const attemptCount = context?.attemptCount || 1
    
    if (attemptCount >= strategy.maxAttempts) {
      logger.warn(`Max attempts reached for ${errorType}. Executing fallback action.`)
      try {
        await strategy.fallbackAction()
        return true
      } catch (fallbackError) {
        logger.error(`Fallback action failed for ${errorType}`, fallbackError)
        return false
      }
    }

    // バックオフ待機
    if (strategy.backoffMs > 0) {
      logger.info(`Waiting ${strategy.backoffMs}ms before retry for ${errorType}`)
      await this.sleep(strategy.backoffMs)
    }

    return false // リトライが必要
  }

  private async setDefaultVariables(): Promise<void> {
    try {
      const { execSync } = await import('child_process')
      
      // デフォルト値でtmux変数を設定
      const defaultVariables = {
        'ccusage_is_active': 'false',
        'ccusage_block_status': 'unavailable',
        'ccusage_total_tokens': '0',
        'ccusage_total_tokens_formatted': '0',
        'ccusage_usage_percent': '0.00%',
        'ccusage_cost_current': '$0.00',
        'ccusage_time_remaining': '--',
        'ccusage_warning_color': 'colour8',
        'ccusage_warning_level': 'none',
        'ccusage_error_message': 'Service unavailable'
      }

      for (const [key, value] of Object.entries(defaultVariables)) {
        execSync(`tmux set-option -g @${key} "${value}"`, { encoding: 'utf8' })
      }
      
      logger.info('Default variables set successfully')
    } catch (error) {
      logger.error('Failed to set default variables', error)
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getErrorStats(): { counts: Record<string, number>; lastOccurrence: Record<string, Date> } {
    const counts: Record<string, number> = {}
    const lastOccurrence: Record<string, Date> = {}

    for (const [errorType, count] of this.errorCounts.entries()) {
      counts[errorType] = count
    }

    for (const [errorType, date] of this.lastErrorTimes.entries()) {
      lastOccurrence[errorType] = date
    }

    return { counts, lastOccurrence }
  }

  clearErrorStats(): void {
    this.errorCounts.clear()
    this.lastErrorTimes.clear()
  }

  setRecoveryStrategy(errorType: ErrorType, strategy: RecoveryStrategy): void {
    this.recoveryStrategies.set(errorType, strategy)
  }
}

// シングルトンインスタンスをエクスポート
export const errorHandler = ErrorHandler.getInstance()