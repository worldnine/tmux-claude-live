/**
 * DataFreshnessManager - データ鮮度管理システム
 * 
 * 「古いデータを表示させない」原則を実現するためのクラス
 * tmux変数にタイムスタンプを付与し、古いデータの自動無効化を行う
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// データ鮮度の定義
export enum DataFreshness {
  FRESH = 'fresh',           // 新鮮（30秒以内）
  STALE = 'stale',          // 古い（30秒-5分）
  EXPIRED = 'expired'        // 期限切れ（5分以上）
}

// データ鮮度の設定
export interface FreshnessConfig {
  freshThresholdSeconds: number;    // 新鮮とみなす秒数（デフォルト: 30）
  staleThresholdSeconds: number;    // 古いとみなす秒数（デフォルト: 300）
  autoInvalidateExpired: boolean;   // 期限切れデータの自動無効化（デフォルト: true）
  warningPrefix: string;            // 警告用プレフィックス（デフォルト: "⚠️"）
}

// タイムスタンプ付きデータ
export interface TimestampedData {
  data: Record<string, string>;
  timestamp: Date;
  freshness: DataFreshness;
}

// ログ出力機能
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private static log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [DataFreshnessManager] [${level.toUpperCase()}]`;
    console[level === 'debug' ? 'log' : level](`${prefix} ${message}`, ...args);
  }

  static debug(message: string, ...args: any[]) { this.log('debug', message, ...args); }
  static info(message: string, ...args: any[]) { this.log('info', message, ...args); }
  static warn(message: string, ...args: any[]) { this.log('warn', message, ...args); }
  static error(message: string, ...args: any[]) { this.log('error', message, ...args); }
}

export class DataFreshnessManager {
  private config: FreshnessConfig;
  private lastDataHash: string | null = null;

  constructor(config?: Partial<FreshnessConfig>) {
    this.config = {
      freshThresholdSeconds: 30,
      staleThresholdSeconds: 300,
      autoInvalidateExpired: true,
      warningPrefix: "⚠️",
      ...config
    };
    
    Logger.debug('DataFreshnessManager initialized', this.config);
  }

  /**
   * tmux変数にタイムスタンプを設定
   */
  private async setTimestamp(): Promise<void> {
    const timestamp = Date.now().toString();
    await execAsync(`tmux set-option -g @ccusage_last_update "${timestamp}"`);
    Logger.debug(`Timestamp set: ${timestamp}`);
  }

  /**
   * tmux変数からタイムスタンプを取得
   */
  private async getTimestamp(): Promise<Date | null> {
    try {
      const { stdout } = await execAsync('tmux show-option -gqv @ccusage_last_update');
      const timestampStr = stdout.trim();
      
      if (!timestampStr) {
        Logger.debug('No timestamp found in tmux variables');
        return null;
      }

      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp)) {
        Logger.warn(`Invalid timestamp format: ${timestampStr}`);
        return null;
      }

      const date = new Date(timestamp);
      Logger.debug(`Retrieved timestamp: ${date.toISOString()}`);
      return date;
    } catch (error: any) {
      Logger.error(`Failed to get timestamp: ${error.message}`);
      return null;
    }
  }

  /**
   * データの鮮度を判定
   */
  private calculateFreshness(timestamp: Date): DataFreshness {
    const now = new Date();
    const ageSeconds = (now.getTime() - timestamp.getTime()) / 1000;

    if (ageSeconds <= this.config.freshThresholdSeconds) {
      return DataFreshness.FRESH;
    } else if (ageSeconds <= this.config.staleThresholdSeconds) {
      return DataFreshness.STALE;
    } else {
      return DataFreshness.EXPIRED;
    }
  }

  /**
   * データの鮮度状態を取得
   */
  async getDataFreshness(): Promise<{ freshness: DataFreshness; age: number; timestamp: Date | null }> {
    const timestamp = await this.getTimestamp();
    
    if (!timestamp) {
      Logger.warn('No timestamp available - data freshness unknown');
      return {
        freshness: DataFreshness.EXPIRED,
        age: Infinity,
        timestamp: null
      };
    }

    const freshness = this.calculateFreshness(timestamp);
    const age = (new Date().getTime() - timestamp.getTime()) / 1000;

    Logger.debug(`Data freshness: ${freshness}, age: ${age.toFixed(1)}s`);
    
    return { freshness, age, timestamp };
  }

  /**
   * データにタイムスタンプを付与して保存
   */
  async storeDataWithTimestamp(data: Record<string, string>): Promise<void> {
    Logger.debug('Storing data with timestamp', Object.keys(data));
    
    // データのハッシュを計算して変更を検出
    const dataString = JSON.stringify(data);
    const dataHash = this.calculateHash(dataString);
    
    // データが変更されていない場合はタイムスタンプも更新しない
    if (this.lastDataHash === dataHash) {
      Logger.debug('Data unchanged, skipping timestamp update');
      return;
    }

    // tmux変数の設定（個別実行で確実性を重視）
    for (const [key, value] of Object.entries(data)) {
      await execAsync(`tmux set-option -g @${key} "${this.escapeString(value)}"`);
    }
    await this.setTimestamp();
    
    this.lastDataHash = dataHash;
    Logger.info(`Data stored with timestamp: ${Object.keys(data).length} variables`);
  }

  /**
   * 期限切れデータを無効化
   */
  async invalidateExpiredData(): Promise<boolean> {
    const { freshness, age } = await this.getDataFreshness();
    
    if (freshness !== DataFreshness.EXPIRED) {
      Logger.debug(`Data is ${freshness}, no invalidation needed`);
      return false;
    }

    if (this.config.autoInvalidateExpired) {
      Logger.warn(`Data is expired (${age.toFixed(1)}s old), invalidating...`);
      
      // 期限切れを示すデータで上書き
      const expiredData = {
        'ccusage_daemon_status': 'data_expired',
        'ccusage_error_message': `${this.config.warningPrefix} Data is ${Math.floor(age)}s old. Daemon may be stopped.`,
        'ccusage_warning_color': 'colour1',  // 赤色
        'ccusage_last_valid_update': await this.formatTimestamp(await this.getTimestamp()),
        'ccusage_data_age': `${Math.floor(age)}s ago`
      };

      await this.storeDataWithTimestamp(expiredData);
      Logger.info('Expired data invalidated and replaced with warning');
      return true;
    }

    Logger.debug('Auto-invalidation disabled, keeping expired data');
    return false;
  }

  /**
   * データに鮮度警告を追加
   */
  async addFreshnessWarnings(data: Record<string, string>): Promise<Record<string, string>> {
    const { freshness, age } = await this.getDataFreshness();
    const modifiedData = { ...data };

    // 鮮度情報を追加
    modifiedData['ccusage_data_freshness'] = freshness;
    modifiedData['ccusage_data_age_seconds'] = Math.floor(age).toString();

    switch (freshness) {
      case DataFreshness.FRESH:
        // 新鮮なデータには何も追加しない
        Logger.debug('Data is fresh, no warnings added');
        break;

      case DataFreshness.STALE:
        // 古いデータには警告色を追加
        modifiedData['ccusage_warning_color'] = 'colour3';  // 黄色
        modifiedData['ccusage_staleness_indicator'] = '⚠️';
        Logger.debug('Added staleness warnings to data');
        break;

      case DataFreshness.EXPIRED:
        // 期限切れデータは自動無効化または強い警告
        if (this.config.autoInvalidateExpired) {
          return await this.getExpiredDataReplacement();
        } else {
          modifiedData['ccusage_warning_color'] = 'colour1';  // 赤色
          modifiedData['ccusage_staleness_indicator'] = '🚨';
          modifiedData['ccusage_error_message'] = `${this.config.warningPrefix} Data is ${Math.floor(age)}s old`;
          Logger.warn('Added strong expiration warnings to data');
        }
        break;
    }

    return modifiedData;
  }

  /**
   * 期限切れデータの代替データを取得
   */
  private async getExpiredDataReplacement(): Promise<Record<string, string>> {
    const { age, timestamp } = await this.getDataFreshness();
    
    return {
      'ccusage_daemon_status': 'expired',
      'ccusage_error_message': `${this.config.warningPrefix} Data expired (${Math.floor(age)}s old)`,
      'ccusage_warning_color': 'colour1',
      'ccusage_last_valid_update': await this.formatTimestamp(timestamp),
      'ccusage_staleness_indicator': '🚨',
      'ccusage_recovery_suggestion': 'Check daemon status or restart manually'
    };
  }

  /**
   * データ鮮度の定期監視を開始
   */
  startFreshnessMonitoring(intervalMs: number = 10000): NodeJS.Timeout {
    Logger.info(`Starting freshness monitoring (interval: ${intervalMs}ms)`);
    
    return setInterval(async () => {
      try {
        Logger.debug('Performing freshness check');
        const invalidated = await this.invalidateExpiredData();
        
        if (invalidated) {
          Logger.warn('Data was invalidated due to expiration');
        }
        
      } catch (error: any) {
        Logger.error(`Error during freshness monitoring: ${error.message}`);
      }
    }, intervalMs);
  }

  /**
   * 文字列のハッシュを計算（簡易版）
   */
  private calculateHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit integer
    }
    return hash.toString();
  }

  /**
   * tmux用に文字列をエスケープ
   */
  private escapeString(str: string): string {
    return str.replace(/"/g, '\\"').replace(/\$/g, '\\$');
  }

  /**
   * タイムスタンプを読みやすい形式でフォーマット
   */
  private async formatTimestamp(timestamp: Date | null): Promise<string> {
    if (!timestamp) {
      return 'Unknown';
    }
    
    return timestamp.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * 設定を取得
   */
  getConfig(): FreshnessConfig {
    return { ...this.config };
  }

  /**
   * 設定を更新
   */
  updateConfig(newConfig: Partial<FreshnessConfig>): void {
    this.config = { ...this.config, ...newConfig };
    Logger.info('Configuration updated', this.config);
  }
}