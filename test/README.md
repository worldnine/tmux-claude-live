# テスト構造

このプロジェクトは、テストピラミッドに基づいた階層化されたテスト構造を採用しています。

## ディレクトリ構造

```
test/
├── unit/                    # 単体テスト (最多)
│   ├── core/               # コア機能のテスト
│   ├── formatters/         # フォーマッターのテスト
│   ├── tmux/               # tmux統合のテスト
│   └── utils/              # ユーティリティのテスト
├── integration/            # 統合テスト (中程度)
│   └── *.integration.test.ts
└── e2e/                    # E2Eテスト (最少)
    └── *.e2e.test.ts
```

## テストの種類

### Unit Tests (単体テスト)

**目的**: 個別のクラス・関数のロジックを検証  
**特徴**:
- モックを使用して外部依存を排除
- 高速実行 (ミリ秒単位)
- 環境非依存
- 100%テストカバレッジを目指す

**実行方法**:
```bash
bun run test:unit
bun run test:unit:watch    # ウォッチモード
```

**例**:
- `CcusageClient.test.ts` - API呼び出しロジック
- `DataProcessor.test.ts` - データ処理・計算
- `TimeFormatter.test.ts` - 時間フォーマット

### Integration Tests (統合テスト)

**目的**: 複数コンポーネント間の連携を検証  
**特徴**:
- 一部の外部依存をモック
- 実際のデータフローをテスト
- 中程度の実行時間 (秒単位)
- 現実的なシナリオをテスト

**実行方法**:
```bash
bun run test:integration
bun run test:integration:watch
```

**例**:
- `StatusUpdater.integration.test.ts` - 全コンポーネント連携

### E2E Tests (エンドツーエンドテスト)

**目的**: 実環境での完全な動作を検証  
**特徴**:
- 実際のコマンド実行 (ccusage, tmux)
- 環境依存 (CI/CDではスキップ可能)
- 低速実行 (分単位)
- 実際のユーザーシナリオをテスト

**実行方法**:
```bash
bun run test:e2e
```

**前提条件**:
- tmuxがインストールされている
- ccusageがインストールされている
- 実際のtmuxセッションが存在する

**例**:
- `daemon.e2e.test.ts` - デーモンの実際の動作

## テスト実行戦略

### 開発時
```bash
# 高速フィードバック: 単体テストのみ
bun run test:unit:watch

# 統合確認: 統合テストも含める
bun run test:integration
```

### CI/CD
```bash
# 単体テスト + 統合テスト
bun run test:unit
bun run test:integration

# E2Eは環境が整った場合のみ
bun run test:e2e
```

### リリース前
```bash
# 全テスト実行
bun run test
bun run test:coverage
```

## モック戦略

### 単体テスト
- `MockCommandExecutor`を使用
- 外部コマンド実行を完全にモック
- 予測可能な結果でテスト

### 統合テスト
- 複数コンポーネントに同じモックを注入
- 実際のデータフローをテスト
- レスポンシブ設定でシナリオテスト

### E2Eテスト
- モック不使用
- 実際のコマンド実行
- 環境エラーの適切な処理

## テスト品質指標

### カバレッジ目標
- **単体テスト**: 95%+ (ビジネスロジック100%)
- **統合テスト**: 主要フロー100%
- **E2Eテスト**: クリティカルパス100%

### パフォーマンス目標
- **単体テスト**: 1テスト < 10ms
- **統合テスト**: 1テスト < 100ms
- **E2Eテスト**: 1テスト < 10s

### 安定性目標
- **単体・統合テスト**: 100%安定
- **E2Eテスト**: 95%安定 (環境要因除く)

## ベストプラクティス

### テスト命名
```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    test('should do something when condition', () => {
      // Arrange
      // Act  
      // Assert
    })
  })
})
```

### テスト構造
1. **Arrange**: テストデータとモックの設定
2. **Act**: テスト対象の実行
3. **Assert**: 結果の検証

### モック使用
```typescript
// Good: 依存注入でモック
const mockExecutor = new MockCommandExecutor()
const client = new CcusageClient(mockExecutor)

// Bad: vi.mockの直接使用 (避ける)
vi.mock('child_process')
```

### エラーハンドリング
```typescript
// 環境依存のE2Eテストでは適切なスキップ
if (error.message.includes('command not found')) {
  console.warn('Skipping E2E test: dependencies not available')
  return
}
```

このテスト構造により、高品質で保守性の高いコードベースを維持できます。