import { execSync } from 'child_process'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  context?: Record<string, any>
  error?: Error
}

export class Logger {
  private static instance: Logger
  private currentLevel: LogLevel = LogLevel.INFO
  private logBuffer: LogEntry[] = []
  private maxBufferSize: number = 100
  private logFile: string | null = null

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level
  }

  setLogFile(filePath: string): void {
    this.logFile = filePath
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, error)
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (level < this.currentLevel) {
      return
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      error
    }

    // バッファに追加
    this.logBuffer.push(entry)
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer.shift()
    }

    // コンソール出力
    this.writeToConsole(entry)

    // ファイル出力
    if (this.logFile) {
      this.writeToFile(entry)
    }
  }

  private writeToConsole(entry: LogEntry): void {
    const levelName = LogLevel[entry.level]
    const timestamp = entry.timestamp.toISOString()
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
    
    let message = `[${timestamp}] ${levelName}: ${entry.message}${contextStr}`
    
    if (entry.error) {
      message += `\nError: ${entry.error.message}`
      if (entry.error.stack) {
        message += `\nStack: ${entry.error.stack}`
      }
    }

    // レベルに応じて出力先を変更
    if (entry.level >= LogLevel.WARN) {
      console.error(message)
    } else {
      console.log(message)
    }
  }

  private writeToFile(entry: LogEntry): void {
    if (!this.logFile) return

    try {
      const levelName = LogLevel[entry.level]
      const timestamp = entry.timestamp.toISOString()
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
      
      let message = `[${timestamp}] ${levelName}: ${entry.message}${contextStr}\n`
      
      if (entry.error) {
        message += `Error: ${entry.error.message}\n`
        if (entry.error.stack) {
          message += `Stack: ${entry.error.stack}\n`
        }
      }

      // ファイルに追記
      execSync(`echo "${message.replace(/"/g, '\\"')}" >> "${this.logFile}"`, { 
        encoding: 'utf8' 
      })
    } catch (error) {
      // ファイル書き込みエラーはコンソールのみに出力
      console.error(`Failed to write to log file: ${error}`)
    }
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level === undefined) {
      return [...this.logBuffer]
    }
    return this.logBuffer.filter(entry => entry.level >= level)
  }

  clearLogs(): void {
    this.logBuffer = []
  }

  getLogStats(): { total: number; byLevel: Record<string, number> } {
    const stats = {
      total: this.logBuffer.length,
      byLevel: {
        DEBUG: 0,
        INFO: 0,
        WARN: 0,
        ERROR: 0
      }
    }

    this.logBuffer.forEach(entry => {
      const levelName = LogLevel[entry.level]
      stats.byLevel[levelName]++
    })

    return stats
  }
}

// シングルトンインスタンスをエクスポート
export const logger = Logger.getInstance()