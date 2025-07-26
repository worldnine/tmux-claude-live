#!/usr/bin/env bun

/**
 * ReliabilityManager統合テスト
 * 「古いデータを表示させない」システムの総合的な動作確認
 */

import { ReliabilityManager, ReliabilityLevel } from './src/utils/ReliabilityManager';
import { DataFreshness } from './src/utils/DataFreshnessManager';

async function testReliabilitySystem() {
  console.log('🛡️ Reliability System 統合テスト開始...\n');
  
  const manager = new ReliabilityManager({
    // テスト用の短い間隔設定
    freshThresholdSeconds: 3,
    staleThresholdSeconds: 8,
    autoInvalidateExpired: true,
    autoRecoveryEnabled: true,
    criticalAlertThreshold: 2
  });
  
  try {
    // Test 1: 初期システム状態の確認
    console.log('📋 Test 1: 初期システム状態の確認');
    let report = await manager.generateSystemReport();
    console.log(`  システム信頼性: ${report.reliability}`);
    console.log(`  デーモン状態: ${report.daemonHealth.isHealthy ? '✅ 健全' : '⚠️ 異常'}`);
    console.log(`  データ鮮度: ${report.dataFreshness.freshness} (${report.dataFreshness.age.toFixed(1)}秒)`);
    console.log(`  問題点数: ${report.criticalIssues.length}`);
    
    // Test 2: 新しいデータの安全な保存
    console.log('\n📋 Test 2: 新しいデータの安全な保存');
    const testData = {
      'ccusage_total_tokens': '15000',
      'ccusage_usage_percent': '10.7%',
      'ccusage_time_remaining': '1h45m',
      'ccusage_burn_rate': '125.5'
    };
    
    await manager.storeDataSafely(testData);
    console.log('  ✅ データを安全に保存（タイムスタンプ付き）');
    
    // Test 3: 保存直後の信頼性確認
    console.log('\n📋 Test 3: 保存直後の信頼性確認');
    report = await manager.generateSystemReport();
    console.log(`  システム信頼性: ${report.reliability}`);
    console.log(`  データ鮮度: ${report.dataFreshness.freshness}`);
    
    const expectedHighReliability = 
      report.dataFreshness.freshness === DataFreshness.FRESH &&
      report.dataFreshness.age < 3;
    
    console.log(`  期待される高信頼性: ${expectedHighReliability ? '✅' : '❌'}`);
    
    // Test 4: 時間経過によるデータ劣化の検出
    console.log('\n📋 Test 4: データ劣化の検出（4秒待機）');
    console.log('  4秒待機中...');
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    report = await manager.generateSystemReport();
    console.log(`  システム信頼性: ${report.reliability}`);
    console.log(`  データ鮮度: ${report.dataFreshness.freshness} (${report.dataFreshness.age.toFixed(1)}秒)`);
    
    const expectedMediumReliability = report.dataFreshness.freshness === DataFreshness.STALE;
    console.log(`  期待される中信頼性: ${expectedMediumReliability ? '✅' : '❌'}`);
    
    // Test 5: さらなる時間経過とデータ期限切れ
    console.log('\n📋 Test 5: データ期限切れの検出（5秒追加待機）');
    console.log('  5秒待機中...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    report = await manager.generateSystemReport();
    console.log(`  システム信頼性: ${report.reliability}`);
    console.log(`  データ鮮度: ${report.dataFreshness.freshness} (${report.dataFreshness.age.toFixed(1)}秒)`);
    
    const expectedLowOrCritical = 
      report.reliability === ReliabilityLevel.LOW || 
      report.reliability === ReliabilityLevel.CRITICAL;
    console.log(`  期待される低信頼性: ${expectedLowOrCritical ? '✅' : '❌'}`);
    
    // Test 6: 自動回復機能のテスト
    console.log('\n📋 Test 6: 自動回復機能のテスト');
    const recovery = await manager.performAutoRecovery();
    console.log(`  自動回復実行: ${recovery.success ? '✅' : '⚠️ 部分的'}`);
    console.log(`  実行されたアクション数: ${recovery.actionsPerformed.length}`);
    
    if (recovery.actionsPerformed.length > 0) {
      console.log('  実行されたアクション:');
      recovery.actionsPerformed.forEach(action => console.log(`    - ${action}`));
    }
    
    // Test 7: 回復後の系統状態確認
    console.log('\n📋 Test 7: 回復後のシステム状態確認');
    await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
    
    const finalReport = await manager.generateSystemReport();
    console.log(`  最終システム信頼性: ${finalReport.reliability}`);
    console.log(`  最終データ鮮度: ${finalReport.dataFreshness.freshness}`);
    console.log(`  推奨アクション数: ${finalReport.recommendations.length}`);
    
    // Test 8: 統計情報の確認
    console.log('\n📋 Test 8: システム統計情報');
    const stats = manager.getStatistics();
    console.log(`  連続失敗回数: ${stats.consecutiveFailures}`);
    console.log(`  最終確認時刻: ${stats.lastReliabilityCheck?.toLocaleString() || '未実行'}`);
    console.log(`  監視状態: ${stats.isMonitoring ? '✅ 監視中' : '⚠️ 停止中'}`);
    
    console.log('\n🎉 Reliability System統合テスト完了!');
    
    // 総合評価
    const systemWorks = 
      finalReport.reliability !== ReliabilityLevel.CRITICAL &&
      recovery.actionsPerformed.length > 0 &&
      finalReport.dataFreshness.freshness !== DataFreshness.EXPIRED;
    
    if (systemWorks) {
      console.log('✅ SUCCESS: 信頼性管理システムが正常に動作しています');
      console.log('🛡️ 「古いデータを表示させない」目標を達成！');
      process.exit(0);
    } else {
      console.log('❌ 信頼性管理システムに課題があります');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ テスト実行エラー:', error);
    process.exit(1);
  }
}

// スクリプト実行
testReliabilitySystem();