import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ログ出力の型定義
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 内部ログ機能
class Logger {
  private static log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [WatchdogManager] [${level.toUpperCase()}]`;
    console[level === 'debug' ? 'log' : level](`${prefix} ${message}`, ...args);
  }

  static debug(message: string, ...args: any[]) { this.log('debug', message, ...args); }
  static info(message: string, ...args: any[]) { this.log('info', message, ...args); }
  static warn(message: string, ...args: any[]) { this.log('warn', message, ...args); }
  static error(message: string, ...args: any[]) { this.log('error', message, ...args); }
}

export interface HealthStatus {
  isHealthy: boolean;
  daemonPid: number | null;
  lastUpdate: Date | null;
  issues: string[];
  recoveryActions: string[];
}

export interface WatchdogConfig {
  checkIntervalMs: number;
  maxRestartAttempts: number;
  restartCooldownMs: number;
  healthCheckTimeoutMs: number;
}

export class WatchdogManager {
  private config: WatchdogConfig;
  private watchInterval: NodeJS.Timeout | null = null;
  private pidCache: { pid: number | null; timestamp: number } | null = null;

  constructor(config?: Partial<WatchdogConfig>) {
    this.config = {
      checkIntervalMs: 30000,
      maxRestartAttempts: 3,
      restartCooldownMs: 5000,
      healthCheckTimeoutMs: 10000,
      ...config
    };
  }

  /**
   * 指定されたPIDのプロセスが生きているかを確認
   * @param pid 確認するプロセスID
   * @returns プロセスが存在する場合はtrue
   */
  async isProcessAlive(pid: number): Promise<boolean> {
    if (!Number.isInteger(pid) || pid <= 0) {
      Logger.warn(`Invalid PID provided: ${pid}`);
      return false;
    }

    try {
      Logger.debug(`Checking process existence: PID ${pid}`);
      await execAsync(`kill -0 ${pid}`);
      Logger.debug(`Process ${pid} is alive`);
      return true;
    } catch (error: any) {
      Logger.debug(`Process ${pid} is not alive: ${error.message}`);
      return false;
    }
  }

  /**
   * tmux変数に保存されたデーモンのPIDを取得
   * @returns デーモンのPID、存在しない場合はnull
   */
  async getDaemonPid(): Promise<number | null> {
    // キャッシュチェック（30秒間有効）
    if (this.pidCache && Date.now() - this.pidCache.timestamp < 30000) {
      Logger.debug(`Using cached PID: ${this.pidCache.pid}`);
      return this.pidCache.pid;
    }

    try {
      Logger.debug('Fetching daemon PID from tmux variables');
      const { stdout } = await execAsync('tmux show-option -gqv @ccusage_daemon_pid');
      const pidString = stdout.trim();
      
      if (!pidString) {
        Logger.debug('No daemon PID found in tmux variables');
        this.pidCache = { pid: null, timestamp: Date.now() };
        return null;
      }

      const pid = parseInt(pidString, 10);
      
      if (isNaN(pid) || pid <= 0) {
        Logger.warn(`Invalid PID format in tmux variable: '${pidString}'`);
        this.pidCache = { pid: null, timestamp: Date.now() };
        return null;
      }

      Logger.info(`Retrieved daemon PID: ${pid}`);
      this.pidCache = { pid, timestamp: Date.now() };
      return pid;
    } catch (error: any) {
      Logger.error(`Failed to get daemon PID: ${error.message}`);
      this.pidCache = { pid: null, timestamp: Date.now() };
      return null;
    }
  }

  /**
   * デーモンが健全に動作しているかを総合判定
   * @returns デーモンが健全な場合はtrue
   */
  async isDaemonHealthy(): Promise<boolean> {
    try {
      Logger.debug('Starting daemon health check');
      
      // 1. PIDを取得
      const pid = await this.getDaemonPid();
      if (!pid) {
        Logger.debug('Health check failed: No daemon PID found');
        return false;
      }

      // 2. プロセスの存在確認
      const isAlive = await this.isProcessAlive(pid);
      if (!isAlive) {
        Logger.warn(`Health check failed: Daemon process ${pid} is not alive`);
        // キャッシュをクリアして次回は最新情報を取得
        this.pidCache = null;
        return false;
      }

      // 3. 最後の更新時刻チェック（この実装では省略、後で追加）
      Logger.debug(`Health check passed: Daemon ${pid} is healthy`);
      return true;
    } catch (error: any) {
      Logger.error(`Health check error: ${error.message}`);
      return false;
    }
  }

  /**
   * デーモンを再起動する
   * @returns 再起動に成功した場合はtrue
   */
  async restartDaemon(): Promise<boolean> {
    Logger.info('Starting daemon restart process');
    
    try {
      // 1. 既存デーモンの停止を試行
      try {
        Logger.debug('Attempting to stop existing daemon');
        await execAsync('bun run src/daemon.ts stop');
        Logger.debug('Daemon stop command executed, waiting 2 seconds');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        Logger.debug(`Daemon stop failed (may already be stopped): ${error.message}`);
      }

      // 2. ロックファイルのクリーンアップ
      try {
        Logger.debug('Cleaning up lock files');
        await execAsync('rm -f /tmp/tmux-claude-live-daemon.lock /tmp/tmux-claude-live-daemon.pid');
      } catch (error: any) {
        Logger.debug(`Lock file cleanup failed: ${error.message}`);
      }

      // 3. 新しいデーモンの起動
      Logger.debug('Starting new daemon');
      await execAsync('bun run src/daemon.ts start');
      
      // 4. 起動確認（3秒後に短縮してパフォーマンス向上）
      Logger.debug('Waiting 3 seconds for daemon startup');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // PIDキャッシュをクリアして最新情報を取得
      this.pidCache = null;
      
      const isHealthy = await this.isDaemonHealthy();
      if (isHealthy) {
        Logger.info('Daemon restart completed successfully');
      } else {
        Logger.warn('Daemon restart completed but health check failed');
      }
      
      return isHealthy;
    } catch (error: any) {
      Logger.error(`Daemon restart failed: ${error.message}`);
      return false;
    }
  }

  /**
   * デーモンが動作していることを保証
   * @returns 最終的にデーモンが健全な場合はtrue
   */
  async ensureDaemonRunning(): Promise<boolean> {
    Logger.debug('Ensuring daemon is running');
    
    const isHealthy = await this.isDaemonHealthy();
    
    if (isHealthy) {
      Logger.debug('Daemon is already healthy');
      return true;
    }

    Logger.warn('Daemon is unhealthy, attempting recovery');
    
    // 不健全な場合は再起動を試行
    let attempts = 0;
    while (attempts < this.config.maxRestartAttempts) {
      attempts++;
      Logger.info(`Recovery attempt ${attempts}/${this.config.maxRestartAttempts}`);
      
      const restartSuccess = await this.restartDaemon();
      
      if (restartSuccess) {
        Logger.info('Daemon recovery successful');
        return true;
      }

      // 失敗した場合はクールダウン
      if (attempts < this.config.maxRestartAttempts) {
        Logger.debug(`Recovery attempt ${attempts} failed, waiting ${this.config.restartCooldownMs}ms`);
        await new Promise(resolve => setTimeout(resolve, this.config.restartCooldownMs));
      }
    }

    Logger.error(`All ${this.config.maxRestartAttempts} recovery attempts failed`);
    return false;
  }

  /**
   * システムの総合的な健康状態を診断
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const issues: string[] = [];
    const recoveryActions: string[] = [];

    // デーモンPIDの取得
    const daemonPid = await this.getDaemonPid();
    if (!daemonPid) {
      issues.push('Daemon PID not found in tmux variables');
      recoveryActions.push('Start daemon manually or check tmux configuration');
    }

    // プロセス存在確認
    let processAlive = false;
    if (daemonPid) {
      processAlive = await this.isProcessAlive(daemonPid);
      if (!processAlive) {
        issues.push(`Daemon process (PID: ${daemonPid}) is not running`);
        recoveryActions.push('Restart daemon automatically');
      }
    }

    const isHealthy = daemonPid !== null && processAlive;

    return {
      isHealthy,
      daemonPid,
      lastUpdate: null, // TODO: 実装する
      issues,
      recoveryActions
    };
  }

  /**
   * 最後のヘルスチェック時刻を取得
   */
  async getLastHealthCheck(): Promise<Date | null> {
    // TODO: 実装する
    return null;
  }

  /**
   * 定期的なヘルスチェックを開始
   */
  startWatching(intervalMs?: number): void {
    if (this.watchInterval) {
      return; // 既に監視中
    }

    const interval = intervalMs || this.config.checkIntervalMs;

    this.watchInterval = setInterval(async () => {
      try {
        Logger.debug('Performing periodic health check');
        const isHealthy = await this.isDaemonHealthy();
        
        if (!isHealthy) {
          Logger.warn('Daemon unhealthy detected, attempting automatic recovery...');
          const recoverySuccess = await this.ensureDaemonRunning();
          
          if (recoverySuccess) {
            Logger.info('Automatic recovery successful');
          } else {
            Logger.error('Automatic recovery failed - manual intervention may be required');
          }
        } else {
          Logger.debug('Periodic health check passed');
        }
      } catch (error: any) {
        Logger.error(`Error during watchdog health check: ${error.message}`);
      }
    }, interval);
  }

  /**
   * 定期的なヘルスチェックを停止
   */
  stopWatching(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }
  }

  /**
   * 監視中かどうかを確認
   */
  isWatching(): boolean {
    return this.watchInterval !== null;
  }
}