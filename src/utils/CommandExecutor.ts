import { execSync } from 'child_process'

/**
 * コマンド実行を抽象化するインターフェース
 * テスト時にはモック実装を、本番時には実際の実装を使用
 */
export interface CommandExecutor {
  /**
   * コマンドを実行して結果を返す
   * @param command 実行するコマンド
   * @param options 実行オプション
   * @returns コマンドの出力結果
   */
  execute(command: string, options?: ExecuteOptions): string
}

export interface ExecuteOptions {
  encoding?: BufferEncoding
  timeout?: number
  cwd?: string
  retries?: number
  retryDelay?: number
}

/**
 * 実際のコマンド実行を行う実装
 * 本番環境で使用
 */
export class RealCommandExecutor implements CommandExecutor {
  execute(command: string, options: ExecuteOptions = {}): string {
    const { 
      encoding = 'utf8', 
      timeout = this.getDefaultTimeout(command), 
      cwd, 
      retries = 3, 
      retryDelay = 1000 
    } = options
    
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return execSync(command, { 
          encoding, 
          timeout, 
          cwd 
        }).toString()
      } catch (error) {
        lastError = error as Error
        
        // 最後の試行でない場合はリトライ
        if (attempt < retries) {
          const delay = retryDelay * attempt // 指数バックオフ
          this.sleep(delay)
          continue
        }
      }
    }
    
    throw new Error(`Command execution failed after ${retries} attempts: ${command}. Last error: ${lastError?.message}`)
  }
  
  private getDefaultTimeout(command: string): number {
    // コマンドの種類に応じて適切なタイムアウトを設定
    if (command.includes('tmux')) {
      return 30000 // tmuxコマンドは30秒
    } else if (command.includes('ccusage')) {
      return 15000 // ccusageコマンドは15秒
    } else {
      return 10000 // その他は10秒
    }
  }
  
  private sleep(ms: number): void {
    const start = Date.now()
    while (Date.now() - start < ms) {
      // ビジーウェイト（非同期処理を避けるため）
    }
  }
}

/**
 * テスト用のモック実装
 * 実際のコマンドを実行せずに予め設定された値を返す
 */
export class MockCommandExecutor implements CommandExecutor {
  private responses: Map<string, string> = new Map()
  private errors: Map<string, Error> = new Map()
  private executedCommands: string[] = []

  /**
   * 特定のコマンドに対するレスポンスを設定
   * @param command コマンド（部分マッチ）
   * @param response 返すレスポンス
   */
  setResponse(command: string, response: string): void {
    this.responses.set(command, response)
  }

  /**
   * 特定のコマンドでエラーを発生させる設定
   * @param command コマンド（部分マッチ）
   * @param error 発生させるエラー
   */
  setError(command: string, error: Error): void {
    this.errors.set(command, error)
  }

  /**
   * 実行されたコマンドをクリア
   */
  clearExecutedCommands(): void {
    this.executedCommands = []
  }

  /**
   * 実行されたコマンドの履歴を取得
   * @returns 実行されたコマンドの配列
   */
  getExecutedCommands(): string[] {
    return [...this.executedCommands]
  }

  /**
   * 特定のコマンドが実行されたかチェック
   * @param command チェックするコマンド（部分マッチ）
   * @returns 実行されたかどうか
   */
  wasCommandExecuted(command: string): boolean {
    return this.executedCommands.some(cmd => cmd.includes(command))
  }

  execute(command: string, options: ExecuteOptions = {}): string {
    this.executedCommands.push(command)

    // エラー設定をチェック（順序を考慮）
    for (const [errorCommand, error] of this.errors) {
      if (command.includes(errorCommand)) {
        throw error
      }
    }

    // レスポンス設定をチェック（より具体的なマッチを優先）
    const sortedResponses = Array.from(this.responses.entries())
      .sort((a, b) => b[0].length - a[0].length) // 長い（具体的な）マッチを優先

    for (const [responseCommand, response] of sortedResponses) {
      if (command.includes(responseCommand)) {
        return response
      }
    }

    // デフォルトレスポンス
    return ''
  }

  /**
   * 全ての設定をクリア
   */
  reset(): void {
    this.responses.clear()
    this.errors.clear()
    this.executedCommands = []
  }
}