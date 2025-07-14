import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export class LockManager {
  private readonly lockFile: string
  private readonly pidFile: string
  private readonly lockTimeout: number

  constructor(lockName: string = 'tmux-claude-live', lockTimeout: number = 30000) {
    const tmpDir = tmpdir()
    this.lockFile = join(tmpDir, `${lockName}.lock`)
    this.pidFile = join(tmpDir, `${lockName}.pid`)
    this.lockTimeout = lockTimeout
  }

  /**
   * ロックを取得します
   * @returns ロックの取得に成功した場合はtrue
   */
  acquire(): boolean {
    try {
      // 既存のロックファイルをチェック
      if (existsSync(this.lockFile)) {
        const lockData = this.readLockFile()
        
        // ロックが有効かチェック
        if (this.isLockValid(lockData)) {
          return false // 既に他のプロセスがロックを持っている
        } else {
          // 無効なロックファイルを削除
          this.forceRelease()
        }
      }

      // 新しいロックを作成
      const lockData = {
        pid: process.pid,
        timestamp: Date.now(),
        hostname: require('os').hostname()
      }

      writeFileSync(this.lockFile, JSON.stringify(lockData, null, 2))
      writeFileSync(this.pidFile, process.pid.toString())

      return true
    } catch (error) {
      console.error('Failed to acquire lock:', error)
      return false
    }
  }

  /**
   * ロックを解放します
   */
  release(): void {
    try {
      if (existsSync(this.lockFile)) {
        const lockData = this.readLockFile()
        
        // 自分のプロセスのロックかチェック
        if (lockData && lockData.pid === process.pid) {
          unlinkSync(this.lockFile)
        }
      }
      
      if (existsSync(this.pidFile)) {
        unlinkSync(this.pidFile)
      }
    } catch (error) {
      console.error('Failed to release lock:', error)
    }
  }

  /**
   * 強制的にロックを解放します（クリーンアップ用）
   */
  forceRelease(): void {
    try {
      if (existsSync(this.lockFile)) {
        unlinkSync(this.lockFile)
      }
      if (existsSync(this.pidFile)) {
        unlinkSync(this.pidFile)
      }
    } catch (error) {
      console.error('Failed to force release lock:', error)
    }
  }

  /**
   * ロックの状態を確認します
   * @returns ロックが有効な場合はtrue
   */
  isLocked(): boolean {
    if (!existsSync(this.lockFile)) {
      return false
    }

    const lockData = this.readLockFile()
    return this.isLockValid(lockData)
  }

  /**
   * 現在のロック情報を取得します
   */
  getLockInfo(): any {
    if (!existsSync(this.lockFile)) {
      return null
    }

    return this.readLockFile()
  }

  /**
   * プロセス終了時にロックを自動解放するハンドラを設定
   */
  setupAutoRelease(): void {
    const cleanup = () => {
      this.release()
      process.exit(0)
    }

    process.on('exit', () => this.release())
    process.on('SIGINT', cleanup)
    process.on('SIGTERM', cleanup)
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error)
      this.release()
      process.exit(1)
    })
  }

  private readLockFile(): any {
    try {
      const content = readFileSync(this.lockFile, 'utf8')
      return JSON.parse(content)
    } catch (error) {
      return null
    }
  }

  private isLockValid(lockData: any): boolean {
    if (!lockData || !lockData.pid || !lockData.timestamp) {
      return false
    }

    // タイムアウトチェック
    const age = Date.now() - lockData.timestamp
    if (age > this.lockTimeout) {
      return false
    }

    // プロセスが実際に存在するかチェック
    try {
      process.kill(lockData.pid, 0) // シグナル0は存在チェック
      return true
    } catch (error) {
      return false // プロセスが存在しない
    }
  }
}