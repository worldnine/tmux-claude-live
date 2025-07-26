#!/usr/bin/env bun

/**
 * WatchdogManager機能検証スクリプト
 * TDDのGREEN段階：実装が正しく動作することを確認
 */

import { WatchdogManager } from './src/utils/WatchdogManager';

async function testWatchdogManager() {
  console.log('🔍 WatchdogManager機能検証開始...\n');
  
  const watchdog = new WatchdogManager();
  
  try {
    // Test 1: プロセス存在確認（自分自身のプロセス）
    console.log('📋 Test 1: プロセス存在確認');
    const currentPid = process.pid;
    const isAlive = await watchdog.isProcessAlive(currentPid);
    console.log(`  現在のプロセス(${currentPid})の存在確認: ${isAlive ? '✅ 生存' : '❌ 死亡'}`);
    
    // Test 2: 存在しないプロセスの確認
    console.log('\n📋 Test 2: 存在しないプロセス確認');
    const nonExistentPid = 999999;
    const isDeadAlive = await watchdog.isProcessAlive(nonExistentPid);
    console.log(`  存在しないプロセス(${nonExistentPid})の確認: ${isDeadAlive ? '❌ 誤判定' : '✅ 正しく死亡判定'}`);
    
    // Test 3: デーモンPID取得
    console.log('\n📋 Test 3: デーモンPID取得');
    const daemonPid = await watchdog.getDaemonPid();
    console.log(`  デーモンPID: ${daemonPid ? `✅ ${daemonPid}` : '⚠️ 未設定'}`);
    
    // Test 4: デーモンヘルスチェック
    console.log('\n📋 Test 4: デーモンヘルスチェック');
    const isHealthy = await watchdog.isDaemonHealthy();
    console.log(`  デーモン健康状態: ${isHealthy ? '✅ 健全' : '⚠️ 異常'}`);
    
    // Test 5: 総合ヘルスチェック
    console.log('\n📋 Test 5: 総合ヘルスチェック');
    const healthStatus = await watchdog.performHealthCheck();
    console.log(`  システム状態: ${healthStatus.isHealthy ? '✅ 健全' : '⚠️ 異常'}`);
    if (healthStatus.issues.length > 0) {
      console.log('  検出された問題:');
      healthStatus.issues.forEach(issue => console.log(`    - ${issue}`));
    }
    if (healthStatus.recoveryActions.length > 0) {
      console.log('  推奨対応:');
      healthStatus.recoveryActions.forEach(action => console.log(`    - ${action}`));
    }
    
    console.log('\n🎉 WatchdogManager機能検証完了!');
    
    // 基本機能が動作していることを確認
    const basicFunctionsWork = 
      typeof isAlive === 'boolean' &&
      !isDeadAlive &&
      typeof isHealthy === 'boolean' &&
      healthStatus.isHealthy !== undefined;
    
    if (basicFunctionsWork) {
      console.log('✅ GREEN: 基本機能が正常に動作しています');
      process.exit(0);
    } else {
      console.log('❌ 基本機能に問題があります');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ テスト実行エラー:', error);
    process.exit(1);
  }
}

// スクリプト実行
testWatchdogManager();