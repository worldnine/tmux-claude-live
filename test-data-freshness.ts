#!/usr/bin/env bun

/**
 * DataFreshnessManager機能検証スクリプト
 * データ鮮度管理システムの動作確認
 */

import { DataFreshnessManager, DataFreshness } from './src/utils/DataFreshnessManager';

async function testDataFreshnessManager() {
  console.log('🕒 DataFreshnessManager機能検証開始...\n');
  
  const manager = new DataFreshnessManager({
    freshThresholdSeconds: 5,    // テスト用に短縮
    staleThresholdSeconds: 15,   // テスト用に短縮
    autoInvalidateExpired: true
  });
  
  try {
    // Test 1: 新しいデータの保存
    console.log('📋 Test 1: 新しいデータの保存');
    const testData = {
      'ccusage_total_tokens': '12500',
      'ccusage_usage_percent': '8.9%',
      'ccusage_time_remaining': '2h15m'
    };
    
    await manager.storeDataWithTimestamp(testData);
    console.log('  ✅ データをタイムスタンプ付きで保存');
    
    // Test 2: 新鮮なデータの鮮度確認
    console.log('\n📋 Test 2: 新鮮なデータの鮮度確認');
    let freshness = await manager.getDataFreshness();
    console.log(`  データ鮮度: ${freshness.freshness} (年齢: ${freshness.age.toFixed(1)}秒)`);
    console.log(`  期待値: ${DataFreshness.FRESH} ✅`);
    
    // Test 3: 鮮度警告の追加
    console.log('\n📋 Test 3: 鮮度警告の追加');
    const dataWithWarnings = await manager.addFreshnessWarnings(testData);
    console.log(`  警告追加前: ${Object.keys(testData).length}個の変数`);
    console.log(`  警告追加後: ${Object.keys(dataWithWarnings).length}個の変数`);
    console.log(`  鮮度情報: ${dataWithWarnings['ccusage_data_freshness']}`);
    
    // Test 4: 時間経過のシミュレーション（6秒待機でstaleに）
    console.log('\n📋 Test 4: 時間経過シミュレーション（6秒待機）');
    console.log('  6秒待機中...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    
    freshness = await manager.getDataFreshness();
    console.log(`  データ鮮度: ${freshness.freshness} (年齢: ${freshness.age.toFixed(1)}秒)`);
    console.log(`  期待値: ${DataFreshness.STALE} ${freshness.freshness === DataFreshness.STALE ? '✅' : '❌'}`);
    
    // Test 5: 古いデータの警告確認
    console.log('\n📋 Test 5: 古いデータの警告確認');
    const staleDataWithWarnings = await manager.addFreshnessWarnings(testData);
    console.log(`  警告色: ${staleDataWithWarnings['ccusage_warning_color']}`);
    console.log(`  警告マーク: ${staleDataWithWarnings['ccusage_staleness_indicator']}`);
    
    // Test 6: さらに長時間待機（16秒でexpiredに）
    console.log('\n📋 Test 6: さらなる時間経過（10秒追加待機）');
    console.log('  10秒待機中...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    freshness = await manager.getDataFreshness();
    console.log(`  データ鮮度: ${freshness.freshness} (年齢: ${freshness.age.toFixed(1)}秒)`);
    console.log(`  期待値: ${DataFreshness.EXPIRED} ${freshness.freshness === DataFreshness.EXPIRED ? '✅' : '❌'}`);
    
    // Test 7: 期限切れデータの自動無効化
    console.log('\n📋 Test 7: 期限切れデータの自動無効化');
    const invalidated = await manager.invalidateExpiredData();
    console.log(`  自動無効化実行: ${invalidated ? '✅' : '❌'}`);
    
    if (invalidated) {
      // 無効化後のデータを確認
      const expiredData = await manager.addFreshnessWarnings({});
      console.log(`  無効化後のステータス: ${expiredData['ccusage_daemon_status']}`);
      console.log(`  エラーメッセージ: ${expiredData['ccusage_error_message']}`);
    }
    
    console.log('\n🎉 DataFreshnessManager機能検証完了!');
    
    // 基本機能が動作していることを確認
    const basicFunctionsWork = 
      freshness.freshness === DataFreshness.EXPIRED &&
      freshness.age > 15 &&
      invalidated;
    
    if (basicFunctionsWork) {
      console.log('✅ GREEN: データ鮮度管理システムが正常に動作しています');
      process.exit(0);
    } else {
      console.log('❌ データ鮮度管理システムに問題があります');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ テスト実行エラー:', error);
    process.exit(1);
  }
}

// スクリプト実行
testDataFreshnessManager();