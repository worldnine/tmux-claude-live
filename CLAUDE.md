# CLAUDE.md - tmux-claude-live Development Guide

## Project Overview

**tmux-claude-live** は、ccusageの`--live`機能を活用してtmux変数システムを通じてClaude Code使用状況をリアルタイムモニタリングするツールです。

### 設計コンセプト

1. **高いカスタマイズ性**: ユーザーがtmux.confで表示内容を自由に設定可能
2. **tmuxネイティブ**: tmuxの変数システムを最大限活用
3. **パフォーマンス重視**: 軽量で効率的な処理

### 想定される使用例

```bash
# ~/.tmux.conf

# シンプル版
set -g status-right "⏱ #{@ccusage_time_remaining} | 🎯 #{@ccusage_tokens_remaining_formatted} (#{@ccusage_usage_percent})"

# 詳細版
set -g status-right "#[fg=#{@ccusage_warning_color}]Claude: #{@ccusage_total_tokens_formatted}/#{@ccusage_token_limit_formatted} (#{@ccusage_usage_percent}) | #{@ccusage_burn_rate}/min | ⏱ #{@ccusage_time_remaining} | #{@ccusage_cost_current}#[default]"

# プログレスバー版
set -g status-right "Claude [#[fg=#{@ccusage_warning_color}]#{@ccusage_progress_bar}#[default]] #{@ccusage_usage_percent} | #{@ccusage_time_remaining}"
```

## Development Environment Setup

### Prerequisites

```bash
# 必要なツール
- Node.js 20+
- Bun (latest)
- ccusage (npm install -g ccusage)
- tmux
- jq (JSON処理用)
```

### mise設定

```bash
# .mise.toml
[tools]
node = "20"
bun = "latest"
jq = "latest"

[env]
NODE_ENV = "development"
```

```bash
# セットアップ
curl https://mise.run | sh
mise install
```

## Project Structure

```
tmux-claude-live/
├── .mise.toml
├── README.md
├── CLAUDE.md                        # このファイル
├── package.json
├── tsconfig.json
├── vitest.config.ts                 # テスト設定
├── docs/                            # ドキュメント
│   ├── ccusage-api-specification.md
│   ├── ccusage-live-specification.md
│   ├── ccusage-token-limit-discovery.md  # ⭐ 重要：制限値機能の発見
│   └── tmux-variables-design.md
├── src/
│   ├── core/                        # コア機能
│   │   ├── CcusageClient.ts         # ccusage API呼び出し
│   │   ├── DataProcessor.ts         # データ処理・計算
│   │   └── ConfigManager.ts         # 設定管理
│   ├── formatters/                  # フォーマッター
│   │   ├── TimeFormatter.ts         # 時間表示形式
│   │   ├── TokenFormatter.ts        # トークン表示形式
│   │   ├── CostFormatter.ts         # コスト表示形式
│   │   └── ProgressBarGenerator.ts  # プログレスバー生成
│   ├── tmux/                        # tmux統合
│   │   ├── VariableManager.ts       # tmux変数管理
│   │   ├── ColorResolver.ts         # 色決定ロジック
│   │   └── StatusUpdater.ts         # ステータス更新
│   └── utils/                       # ユーティリティ
│       ├── Calculator.ts            # 計算ユーティリティ
│       ├── Validator.ts             # データ検証
│       ├── Logger.ts                # ログ管理
│       ├── ErrorHandler.ts          # エラーハンドリング
│       └── CommandExecutor.ts       # コマンド実行抽象化
├── test/                            # テストファイル
│   ├── core/
│   ├── formatters/
│   ├── tmux/
│   └── utils/
├── claude-live.tmux                 # tmuxプラグイン本体
└── scripts/
    └── update-variables.sh          # 変数更新スクリプト
```

## TDD Development Flow

### 重要：テストでレッドが確認できたら仕様書を作成する

TDDの各サイクルで、テストが失敗（RED）した時点で、そのテストを満たすための**詳細な日本語仕様書**を作成します。

### TDD Cycle

1. 🔴 **Red**: Write a failing test
2. 📝 **Spec**: 日本語仕様書作成
3. 🟢 **Green**: Write minimal code to pass
4. 🔵 **Refactor**: Improve code while keeping tests green

### 開発順序

#### Phase 1: Core Components (コア機能)

1. **CcusageClient**: ccusage APIとの連携
2. **DataProcessor**: データ処理・計算ロジック
3. **Validator**: データ検証

#### Phase 2: Formatters (フォーマッター)

1. **TimeFormatter**: 時間表示形式
2. **TokenFormatter**: トークン表示形式
3. **CostFormatter**: コスト表示形式
4. **ProgressBarGenerator**: プログレスバー生成

#### Phase 3: Tmux Integration (tmux統合)

1. **ColorResolver**: 警告色決定ロジック
2. **VariableManager**: tmux変数管理
3. **StatusUpdater**: ステータス更新システム

#### Phase 4: Plugin System (プラグインシステム)

1. **claude-live.tmux**: tmuxプラグイン本体
2. **ConfigManager**: 設定管理システム

## 実装例：TDD実践

### Step 1: CcusageClient (RED 🔴)

```typescript
// test/core/CcusageClient.test.ts
import { describe, expect, test } from 'bun:test';
import { CcusageClient } from '../../src/core/CcusageClient';

describe('CcusageClient', () => {
  test('should get active block data', async () => {
    // Arrange
    const client = new CcusageClient();
    
    // Act
    const blockData = await client.getActiveBlock();
    
    // Assert
    expect(blockData).toBeDefined();
    expect(blockData.isActive).toBe(true);
    expect(blockData.totalTokens).toBeGreaterThan(0);
  });
});
```

### Step 2: 仕様書作成 (SPEC 📝)

```markdown
# CcusageClient クラス仕様書

## 概要
CcusageClientは、ccusage APIとの連携を担当するクラスです。

## 責務
- ccusage blocks --active --json コマンドの実行
- JSONレスポンスの解析
- エラーハンドリング

## 詳細仕様

### getActiveBlock(): Promise<BlockData | null>
- ccusage blocks --active --json を実行
- JSONレスポンスをBlockData型に変換
- エラー時はnullを返す

### BlockData型
```typescript
interface BlockData {
  isActive: boolean;
  totalTokens: number;
  costUSD: number;
  projection: {
    remainingMinutes: number;
  };
  burnRate: {
    tokensPerMinute: number;
  };
}
```
```

### Step 3: 実装 (GREEN 🟢)

```typescript
// src/core/CcusageClient.ts
import { execSync } from 'child_process';

export interface BlockData {
  isActive: boolean;
  totalTokens: number;
  costUSD: number;
  projection: {
    remainingMinutes: number;
  };
  burnRate: {
    tokensPerMinute: number;
  };
}

export class CcusageClient {
  async getActiveBlock(): Promise<BlockData | null> {
    try {
      const output = execSync('ccusage blocks --active --json', { 
        encoding: 'utf8',
        timeout: 5000 
      });
      
      const data = JSON.parse(output);
      return this.transformToBlockData(data);
    } catch (error) {
      return null;
    }
  }
  
  private transformToBlockData(data: any): BlockData | null {
    if (!data.blocks || data.blocks.length === 0) {
      return null;
    }
    
    const block = data.blocks[0];
    return {
      isActive: block.isActive,
      totalTokens: block.totalTokens,
      costUSD: block.costUSD,
      projection: {
        remainingMinutes: block.projection.remainingMinutes
      },
      burnRate: {
        tokensPerMinute: block.burnRate.tokensPerMinute
      }
    };
  }
}
```

## tmux変数システム

### 提供する変数

詳細は[tmux-variables-design.md](./docs/tmux-variables-design.md)を参照。

主要な変数：
- `@ccusage_time_remaining`: 残り時間（例：`2h15m`）
- `@ccusage_total_tokens_formatted`: トークン数（例：`12.5k`）
- `@ccusage_usage_percent`: 使用率（例：`8.9%`）
- `@ccusage_cost_current`: 現在のコスト（例：`$1.85`）
- `@ccusage_warning_color`: 警告色（例：`colour2`）
- `@ccusage_progress_bar`: プログレスバー（例：`████████░░`）

### 実装例

```typescript
// src/tmux/VariableManager.ts
import { execSync } from 'child_process';

export class VariableManager {
  setVariable(name: string, value: string): void {
    execSync(`tmux set-option -g @${name} "${value}"`, { 
      encoding: 'utf8' 
    });
  }
  
  setBulkVariables(variables: Record<string, string>): void {
    const commands = Object.entries(variables)
      .map(([name, value]) => `set-option -g @${name} "${value}"`)
      .join('; ');
    
    execSync(`tmux ${commands}`, { encoding: 'utf8' });
  }
}
```

## Test Strategy

### Unit Tests (単体テスト)

```typescript
// test/formatters/TimeFormatter.test.ts
import { describe, expect, test } from 'bun:test';
import { TimeFormatter } from '../../src/formatters/TimeFormatter';

describe('TimeFormatter', () => {
  test.each([
    [0, '0m'],
    [60, '1m'],
    [135, '2h15m'],
    [300, '5h0m'],
  ])('should format %i minutes as %s', (minutes, expected) => {
    expect(TimeFormatter.format(minutes)).toBe(expected);
  });
});
```

### Integration Tests (統合テスト)

```typescript
// test/integration/CcusageIntegration.test.ts
import { describe, expect, test } from 'bun:test';
import { CcusageClient } from '../../src/core/CcusageClient';
import { VariableManager } from '../../src/tmux/VariableManager';

describe('Ccusage Integration', () => {
  test('should update tmux variables from ccusage data', async () => {
    // Arrange
    const client = new CcusageClient();
    const variableManager = new VariableManager();
    
    // Act
    const blockData = await client.getActiveBlock();
    if (blockData) {
      variableManager.setVariable('ccusage_total_tokens', blockData.totalTokens.toString());
    }
    
    // Assert
    expect(blockData).toBeDefined();
  });
});
```

### Performance Tests (パフォーマンステスト)

```typescript
// test/performance/UpdatePerformance.test.ts
import { describe, expect, test } from 'bun:test';
import { StatusUpdater } from '../../src/tmux/StatusUpdater';

describe('Update Performance', () => {
  test('should update all variables within 100ms', async () => {
    // Arrange
    const updater = new StatusUpdater();
    
    // Act
    const startTime = Date.now();
    await updater.updateAll();
    const endTime = Date.now();
    
    // Assert
    expect(endTime - startTime).toBeLessThan(100);
  });
});
```

## Error Handling

### エラー状態の管理

```typescript
// src/core/ErrorHandler.ts
export enum ErrorState {
  CCUSAGE_NOT_FOUND = 'ccusage_not_found',
  NO_DATA = 'no_data',
  PERMISSION_ERROR = 'permission_error',
  PARSE_ERROR = 'parse_error'
}

export class ErrorHandler {
  static handleError(error: Error): ErrorState {
    if (error.message.includes('command not found')) {
      return ErrorState.CCUSAGE_NOT_FOUND;
    }
    // ... その他のエラー処理
    return ErrorState.PARSE_ERROR;
  }
  
  static getErrorVariables(errorState: ErrorState): Record<string, string> {
    switch (errorState) {
      case ErrorState.CCUSAGE_NOT_FOUND:
        return {
          'ccusage_block_status': 'error',
          'ccusage_error_message': 'ccusage command not found',
          'ccusage_warning_color': 'colour1'
        };
      // ... その他のエラー状態
    }
  }
}
```

## Configuration

### 設定システム

```typescript
// src/core/ConfigManager.ts
export interface Config {
  updateInterval: number;
  tokenLimit: number;
  warningThresholds: {
    usage: [number, number];
    time: [number, number];
  };
  displayFormats: {
    time: 'compact' | 'verbose' | 'short';
    cost: 'currency' | 'number' | 'compact';
    token: 'compact' | 'full' | 'short';
  };
}

export class ConfigManager {
  private static readonly DEFAULT_CONFIG: Config = {
    updateInterval: 5,
    tokenLimit: 140000,
    warningThresholds: {
      usage: [70, 90],
      time: [60, 30]
    },
    displayFormats: {
      time: 'compact',
      cost: 'currency',
      token: 'compact'
    }
  };
  
  static loadConfig(): Config {
    // tmux変数から設定を読み込み
    // デフォルト値とマージ
    return this.DEFAULT_CONFIG;
  }
}
```

## Development Workflow

### 1. 新機能開発

```bash
# 1. テストファイル作成
touch test/formatters/NewFormatter.test.ts

# 2. 失敗するテストを書く
bun test test/formatters/NewFormatter.test.ts
# ❌ RED

# 3. 日本語仕様書を作成
# docs/specifications/NewFormatter.md

# 4. 実装
touch src/formatters/NewFormatter.ts
bun test test/formatters/NewFormatter.test.ts
# ✅ GREEN

# 5. リファクタリング
# コードを改善
bun test
# ✅ All tests pass
```

### 2. 継続的テスト

```bash
# ウォッチモード
bun test --watch

# カバレッジ
bun test --coverage

# 特定のパターン
bun test -t "should format time"
```

## Deployment

### tmuxプラグインとしての配布

```bash
# claude-live.tmux
#!/usr/bin/env bash

CURRENT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# プラグインの初期化
main() {
  # デフォルト設定
  tmux set-option -g @ccusage_update_interval "5"
  tmux set-option -g @ccusage_token_limit "140000"
  
  # 更新スクリプトの開始
  tmux run-shell "cd $CURRENT_DIR && bun run start-daemon"
}

main
```

### インストール

```bash
# 1. リポジトリクローン
git clone https://github.com/username/tmux-claude-live.git

# 2. 依存関係インストール
cd tmux-claude-live
bun install
bun run build

# 3. tmux設定に追加
echo 'run-shell "~/tmux-claude-live/claude-live.tmux"' >> ~/.tmux.conf

# 4. tmux再読み込み
tmux source-file ~/.tmux.conf
```

## Best Practices

### 1. パフォーマンス

- 5秒間隔での更新（カスタマイズ可能）
- 30秒TTLキャッシュによる効率化
- 指数バックオフリトライ機能
- キャッシュヒット/ミス統計

### 2. エラーハンドリング

- 8種類のエラー分類と自動回復
- 構造化ログ出力（DEBUG/INFO/WARN/ERROR）
- 適切なフォールバック戦略
- エラー統計とメトリクス

### 3. テスト

- 100%テストカバレッジ
- モックの適切な使用
- パフォーマンステスト

### 4. ドキュメント

- README.mdの充実
- 設定例の提供
- トラブルシューティング

## 重要な発見・知見

### ⭐ ccusage制限値機能の発見 (2025-07-12)

ccusageには`--token-limit`オプションと`tokenLimitStatus`フィールドが存在することが判明しました。
詳細は **[ccusage-token-limit-discovery.md](./docs/ccusage-token-limit-discovery.md)** を参照。

**影響**:
- より正確な使用率計算
- ccusageの`status`フィールドベースの警告システム
- 独自計算からccusage計算結果の優先使用への変更

**活用方法**:
```bash
# tmux設定で制限値を指定
set -g @ccusage_token_limit "140000"

# ccusageが制限値付きで実行される
ccusage blocks --active --json --token-limit 140000
```

## Resources

- [ccusage Documentation](https://ccusage.com/)
- [tmux Manual](https://man.openbsd.org/tmux)
- [Bun Documentation](https://bun.sh/docs)
- [TDD Best Practices](https://github.com/t-wada/tdd-exercises)

## TDD開発フロー図

```mermaid
flowchart TD
    Start([開始]) --> WriteTest[テストを書く]
    WriteTest --> RunTest{テスト実行}
    RunTest -->|失敗 🔴| Red[レッド状態確認]
    Red --> WriteSpec[日本語仕様書作成]
    WriteSpec --> Review{仕様レビュー}
    Review -->|OK| WriteCode[最小限のコード実装]
    Review -->|NG| WriteSpec
    WriteCode --> RunTest2{テスト実行}
    RunTest2 -->|成功 🟢| Green[グリーン状態確認]
    RunTest2 -->|失敗 🔴| WriteCode
    Green --> Refactor[リファクタリング]
    Refactor --> RunTest3{テスト実行}
    RunTest3 -->|成功 🟢| Commit[コミット]
    RunTest3 -->|失敗 🔴| Refactor
    Commit --> NextFeature{次の機能?}
    NextFeature -->|Yes| WriteTest
    NextFeature -->|No| End([完了])

    style Red fill:#ff6b6b,stroke:#333,stroke-width:2px
    style Green fill:#51cf66,stroke:#333,stroke-width:2px
    style WriteSpec fill:#ffd43b,stroke:#333,stroke-width:2px
    style Refactor fill:#74b9ff,stroke:#333,stroke-width:2px
```

---

Remember: **Test → Spec → Code → Refactor** 🔴📝🟢🔵

このガイドに従って、tmux変数システムを活用した柔軟で高性能なClaude Code監視ツールを構築しましょう。