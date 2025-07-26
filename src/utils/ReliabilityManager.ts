/**
 * ReliabilityManager - 信頼性管理システム
 * 
 * WatchdogManagerとDataFreshnessManagerを統合し、
 * 「常に正しい情報が表示される状態」を実現する
 */

import { WatchdogManager, HealthStatus } from './WatchdogManager';
import { DataFreshnessManager, DataFreshness } from './DataFreshnessManager';

// 信頼性レベルの定義
export enum ReliabilityLevel {
  HIGH = 'high',        // 高信頼：デーモン稼働中、データ新鮮
  MEDIUM = 'medium',    // 中信頼：デーモン稼働中、データやや古い
  LOW = 'low',          // 低信頼：デーモン不安定、データ古い
  CRITICAL = 'critical' // 危険：デーモン停止、データ期限切れ
}

// システム状態の統合レポート
export interface SystemReliabilityReport {
  reliability: ReliabilityLevel;
  daemonHealth: HealthStatus;
  dataFreshness: {
    freshness: DataFreshness;
    age: number;
    timestamp: Date | null;
  };
  recommendations: string[];
  criticalIssues: string[];
  autoActionsPerformed: string[];
}

// 統合設定
export interface ReliabilityConfig {
  // Watchdog設定
  daemonCheckIntervalMs: number;
  maxRestartAttempts: number;
  restartCooldownMs: number;
  
  // データ鮮度設定
  freshThresholdSeconds: number;
  staleThresholdSeconds: number;
  autoInvalidateExpired: boolean;
  
  // 統合監視設定
  reliabilityCheckIntervalMs: number;
  autoRecoveryEnabled: boolean;
  criticalAlertThreshold: number; // 連続失敗回数
}

// ログ出力機能
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private static log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [ReliabilityManager] [${level.toUpperCase()}]`;
    console[level === 'debug' ? 'log' : level](`${prefix} ${message}`, ...args);
  }

  static debug(message: string, ...args: any[]) { this.log('debug', message, ...args); }
  static info(message: string, ...args: any[]) { this.log('info', message, ...args); }
  static warn(message: string, ...args: any[]) { this.log('warn', message, ...args); }
  static error(message: string, ...args: any[]) { this.log('error', message, ...args); }
}

export class ReliabilityManager {
  private config: ReliabilityConfig;
  private watchdog: WatchdogManager;
  private dataManager: DataFreshnessManager;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private lastReliabilityCheck: Date | null = null;

  constructor(config?: Partial<ReliabilityConfig>) {
    this.config = {
      // デフォルト設定
      daemonCheckIntervalMs: 30000,
      maxRestartAttempts: 3,
      restartCooldownMs: 5000,
      freshThresholdSeconds: 30,
      staleThresholdSeconds: 300,
      autoInvalidateExpired: true,
      reliabilityCheckIntervalMs: 15000,
      autoRecoveryEnabled: true,
      criticalAlertThreshold: 3,
      ...config
    };

    // 子管理クラスの初期化
    this.watchdog = new WatchdogManager({
      checkIntervalMs: this.config.daemonCheckIntervalMs,
      maxRestartAttempts: this.config.maxRestartAttempts,
      restartCooldownMs: this.config.restartCooldownMs
    });

    this.dataManager = new DataFreshnessManager({
      freshThresholdSeconds: this.config.freshThresholdSeconds,
      staleThresholdSeconds: this.config.staleThresholdSeconds,
      autoInvalidateExpired: this.config.autoInvalidateExpired
    });

    Logger.info('ReliabilityManager initialized', this.config);
  }

  /**
   * システム全体の信頼性レベルを判定
   */
  private calculateReliabilityLevel(
    daemonHealth: HealthStatus,
    dataFreshness: { freshness: DataFreshness; age: number }
  ): ReliabilityLevel {
    
    // 危険レベル：デーモン停止 + データ期限切れ
    if (!daemonHealth.isHealthy && dataFreshness.freshness === DataFreshness.EXPIRED) {
      return ReliabilityLevel.CRITICAL;
    }

    // 低信頼：デーモン不安定またはデータ期限切れ
    if (!daemonHealth.isHealthy || dataFreshness.freshness === DataFreshness.EXPIRED) {
      return ReliabilityLevel.LOW;
    }

    // 中信頼：デーモン稼働中だがデータが古い
    if (daemonHealth.isHealthy && dataFreshness.freshness === DataFreshness.STALE) {
      return ReliabilityLevel.MEDIUM;
    }

    // 高信頼：デーモン稼働中 + データ新鮮
    return ReliabilityLevel.HIGH;
  }

  /**
   * 推奨アクションを生成
   */
  private generateRecommendations(
    reliability: ReliabilityLevel,
    daemonHealth: HealthStatus,
    dataFreshness: { freshness: DataFreshness; age: number }
  ): string[] {
    const recommendations: string[] = [];

    switch (reliability) {
      case ReliabilityLevel.CRITICAL:
        recommendations.push('🚨 CRITICAL: Immediate attention required');
        recommendations.push('Restart daemon immediately');
        recommendations.push('Check system logs for root cause');
        recommendations.push('Consider manual verification of ccusage installation');
        break;

      case ReliabilityLevel.LOW:
        if (!daemonHealth.isHealthy) {
          recommendations.push('⚠️ Restart daemon to restore monitoring');
          recommendations.push(...daemonHealth.recoveryActions);
        }
        if (dataFreshness.freshness === DataFreshness.EXPIRED) {
          recommendations.push('⚠️ Data is too old - verify daemon operation');
        }
        break;

      case ReliabilityLevel.MEDIUM:
        recommendations.push('ℹ️ System functioning but data slightly stale');
        recommendations.push('Monitor daemon performance for potential issues');
        break;

      case ReliabilityLevel.HIGH:
        recommendations.push('✅ System operating optimally');
        break;
    }

    return recommendations;
  }

  /**
   * システム全体の信頼性レポートを生成
   */
  async generateSystemReport(): Promise<SystemReliabilityReport> {
    Logger.debug('Generating comprehensive system reliability report');
    
    try {
      // 並行して健康状態とデータ鮮度を確認
      const [daemonHealth, dataFreshness] = await Promise.all([
        this.watchdog.performHealthCheck(),
        this.dataManager.getDataFreshness()
      ]);

      const reliability = this.calculateReliabilityLevel(daemonHealth, dataFreshness);
      const recommendations = this.generateRecommendations(reliability, daemonHealth, dataFreshness);
      
      // 自動実行されたアクションを記録
      const autoActionsPerformed: string[] = [];
      
      const report: SystemReliabilityReport = {
        reliability,
        daemonHealth,
        dataFreshness,
        recommendations,
        criticalIssues: daemonHealth.issues,
        autoActionsPerformed
      };

      Logger.info(`System reliability: ${reliability}`, {
        daemonHealthy: daemonHealth.isHealthy,
        dataFreshness: dataFreshness.freshness,
        dataAge: `${dataFreshness.age.toFixed(1)}s`
      });

      return report;
      
    } catch (error: any) {
      Logger.error(`Failed to generate system report: ${error.message}`);
      
      // エラー時のフォールバック報告
      return {
        reliability: ReliabilityLevel.CRITICAL,
        daemonHealth: {
          isHealthy: false,
          daemonPid: null,
          lastUpdate: null,
          issues: ['Failed to perform health check'],
          recoveryActions: ['Check system logs', 'Restart monitoring manually']
        },
        dataFreshness: {
          freshness: DataFreshness.EXPIRED,
          age: Infinity,
          timestamp: null
        },
        recommendations: ['🚨 System health check failed - immediate attention required'],
        criticalIssues: ['Health check failure'],
        autoActionsPerformed: []
      };
    }
  }

  /**
   * 自動回復処理を実行
   */
  async performAutoRecovery(): Promise<{ success: boolean; actionsPerformed: string[] }> {
    if (!this.config.autoRecoveryEnabled) {
      Logger.debug('Auto-recovery disabled in configuration');
      return { success: true, actionsPerformed: [] };
    }

    Logger.info('Starting automatic recovery process');
    const actionsPerformed: string[] = [];
    let success = true;

    try {
      // 1. データ期限切れの対処
      const dataInvalidated = await this.dataManager.invalidateExpiredData();
      if (dataInvalidated) {
        actionsPerformed.push('Invalidated expired data');
        Logger.info('Expired data invalidated during auto-recovery');
      }

      // 2. デーモンの自動復旧
      const daemonRecovered = await this.watchdog.ensureDaemonRunning();
      if (daemonRecovered) {
        actionsPerformed.push('Daemon automatically restarted');
        Logger.info('Daemon recovery successful during auto-recovery');
      } else {
        actionsPerformed.push('Daemon recovery attempted but failed');
        success = false;
        Logger.warn('Daemon recovery failed during auto-recovery');
      }

      // 3. 回復後の検証
      if (success) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2秒待機
        const report = await this.generateSystemReport();
        
        if (report.reliability === ReliabilityLevel.HIGH || report.reliability === ReliabilityLevel.MEDIUM) {
          actionsPerformed.push('System reliability restored');
          this.consecutiveFailures = 0; // 成功時はカウンターをリセット
          Logger.info('Auto-recovery completed successfully');
        } else {
          success = false;
          Logger.warn('Auto-recovery completed but system reliability still low');
        }
      }

    } catch (error: any) {
      Logger.error(`Auto-recovery failed: ${error.message}`);
      actionsPerformed.push(`Recovery error: ${error.message}`);
      success = false;
    }

    return { success, actionsPerformed };
  }

  /**
   * データの安全な保存（鮮度管理付き）
   */
  async storeDataSafely(data: Record<string, string>): Promise<void> {
    Logger.debug('Storing data with reliability checks', Object.keys(data));
    
    try {
      // データ鮮度管理を通じて保存
      await this.dataManager.storeDataWithTimestamp(data);
      Logger.info(`Data stored safely: ${Object.keys(data).length} variables`);
      
    } catch (error: any) {
      Logger.error(`Failed to store data safely: ${error.message}`);
      throw error;
    }
  }

  /**
   * 信頼性監視を開始
   */
  startReliabilityMonitoring(): void {
    if (this.monitoringInterval) {
      Logger.warn('Reliability monitoring already started');
      return;
    }

    Logger.info(`Starting reliability monitoring (interval: ${this.config.reliabilityCheckIntervalMs}ms)`);
    
    this.monitoringInterval = setInterval(async () => {
      try {
        Logger.debug('Performing periodic reliability check');
        const report = await this.generateSystemReport();
        this.lastReliabilityCheck = new Date();

        // 危険レベルまたは低信頼の場合は自動回復を試行
        if (report.reliability === ReliabilityLevel.CRITICAL || report.reliability === ReliabilityLevel.LOW) {
          this.consecutiveFailures++;
          Logger.warn(`System reliability is ${report.reliability} (consecutive failures: ${this.consecutiveFailures})`);
          
          const recovery = await this.performAutoRecovery();
          
          if (recovery.success) {
            Logger.info('Automatic recovery successful');
          } else {
            Logger.error('Automatic recovery failed');
            
            // 連続失敗が閾値を超えた場合
            if (this.consecutiveFailures >= this.config.criticalAlertThreshold) {
              Logger.error(`🚨 CRITICAL: ${this.consecutiveFailures} consecutive failures - manual intervention required`);
            }
          }
        } else {
          // 正常な場合は連続失敗カウンターをリセット
          if (this.consecutiveFailures > 0) {
            Logger.info(`System recovered after ${this.consecutiveFailures} consecutive failures`);
            this.consecutiveFailures = 0;
          }
          Logger.debug(`Reliability check passed: ${report.reliability}`);
        }

      } catch (error: any) {
        Logger.error(`Error during reliability monitoring: ${error.message}`);
        this.consecutiveFailures++;
      }
    }, this.config.reliabilityCheckIntervalMs);
  }

  /**
   * 信頼性監視を停止
   */
  stopReliabilityMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      Logger.info('Reliability monitoring stopped');
    }
  }

  /**
   * 監視状態を確認
   */
  isMonitoring(): boolean {
    return this.monitoringInterval !== null;
  }

  /**
   * 設定を取得
   */
  getConfig(): ReliabilityConfig {
    return { ...this.config };
  }

  /**
   * 統計情報を取得
   */
  getStatistics(): {
    consecutiveFailures: number;
    lastReliabilityCheck: Date | null;
    isMonitoring: boolean;
  } {
    return {
      consecutiveFailures: this.consecutiveFailures,
      lastReliabilityCheck: this.lastReliabilityCheck,
      isMonitoring: this.isMonitoring()
    };
  }

  /**
   * システムの強制回復
   */
  async forceSystemRecovery(): Promise<SystemReliabilityReport> {
    Logger.warn('Force system recovery initiated');
    
    const recovery = await this.performAutoRecovery();
    const report = await this.generateSystemReport();
    
    report.autoActionsPerformed = recovery.actionsPerformed;
    
    Logger.info(`Force recovery completed: ${recovery.success ? 'SUCCESS' : 'FAILED'}`);
    return report;
  }
}