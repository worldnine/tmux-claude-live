# 将来の改善項目

## 🎯 ユーザーからの要望・改善アイデア

### 1. 自由な配置システム (高優先度)

#### 📋 要望内容
- tmuxステータスバーでの自由な配置を実現したい
- 既存のステータス情報を保持しつつ、Claude Live情報を好きな位置に配置
- status-left、status-right、中央など任意の位置への配置

#### 🔧 現在の制限
- プラグインが自動的にstatus-rightに固定配置を強制
- 既存のステータス情報を上書きしてしまう可能性
- ユーザーが細かな位置調整を行いにくい

#### 💡 解決策案

##### A. 完全な変数ベースシステム
```bash
# 現在の実装
@ccusage_total_tokens_formatted
@ccusage_usage_percent
@ccusage_time_remaining
# ... 他の変数

# 追加予定の変数
@ccusage_preset_minimal      # "12.5k/140k"
@ccusage_preset_detailed     # "12.5k/140k (8.9%) | 2h15m | $1.85"
@ccusage_preset_compact      # "12.5k/140k 8.9%"
@ccusage_token_ratio         # "12.5k/140k"
@ccusage_usage_indicator     # "●" (色付き)
```

##### B. 設定オプションの追加
```bash
# 自動ステータス設定のオン/オフ
set -g @ccusage_auto_status "off"    # デフォルト: off

# 自動設定する場合の配置
set -g @ccusage_status_position "right"  # right/left/center
set -g @ccusage_status_append "true"     # 追加/上書き

# プリセット選択
set -g @ccusage_preset "minimal"         # minimal/detailed/compact/custom
set -g @ccusage_custom_format "あなたの好きな形式"
```

##### C. 柔軟な使用例
```bash
# 1. 完全手動設定（推奨）
set -g status-right "%H:%M | #{@ccusage_preset_minimal}"

# 2. 既存ステータスに追加
set -g status-right "#{status_right} | #{@ccusage_token_ratio}"

# 3. 複数箇所に配置
set -g status-left "#{@ccusage_usage_indicator} #{session_name}"
set -g status-right "#{@ccusage_time_remaining} | %H:%M"

# 4. 自動設定（簡単だが制限あり）
set -g @ccusage_auto_status "on"
set -g @ccusage_preset "detailed"
```

#### 🏗️ 実装計画

1. **Phase 1**: 新しい変数とプリセットの追加
2. **Phase 2**: 自動ステータス設定のオプション化
3. **Phase 3**: 設定検証とエラーハンドリング
4. **Phase 4**: ドキュメンテーションと使用例の充実

#### 📊 期待される効果
- **完全な自由度**: ユーザーが好きな場所に配置
- **既存環境を破壊しない**: デフォルトで何も変更しない
- **段階的導入**: 簡単→詳細まで対応
- **保守性**: 変数ベースで管理が容易

---

### 2. その他の改善項目

#### 🔄 リアルタイム更新の最適化
- 差分更新による効率化
- 必要な場合のみ更新実行
- CPU負荷の軽減

#### 🎨 テーマシステム
- 色テーマの事前定義
- ダークモード/ライトモード対応
- カスタム色パレット

#### 📱 通知機能
- 警告レベル到達時の通知
- macOSの通知センター連携
- 音声アラート

#### 📈 統計・履歴機能
- 使用状況の履歴記録
- 日次/週次/月次レポート
- 使用パターンの分析

#### 🔌 他ツールとの連携
- polybar、i3status等との統合
- Slack、Discord等への通知
- ログ出力の改善

---

## 📚 調査したベストプラクティス

### tmuxプラグインの一般的なパターン
1. **変数ベースの設計**: 最大の柔軟性を提供
2. **非侵襲的な初期設定**: デフォルトで既存環境を変更しない
3. **段階的なカスタマイズ**: 簡単→詳細まで対応
4. **豊富な設定オプション**: ユーザーの多様なニーズに対応

### 参考にすべきプラグイン
- tmux-battery: 変数ベースの柔軟な設計
- tmux-cpu: 軽量で効率的な実装
- tmux-continuum: 非侵襲的な設定管理

---

## 🎯 実装優先度

### 高優先度
1. **完全な変数ベースシステム**
2. **自動ステータス設定のオプション化**
3. **プリセットテンプレートの提供**

### 中優先度
1. **設定検証とエラーハンドリング**
2. **ドキュメンテーションの充実**
3. **使用例の拡充**

### 低優先度
1. **テーマシステム**
2. **通知機能**
3. **統計・履歴機能**

---

## 📝 実装時の注意点

### 1. 下位互換性の維持
- 既存の設定が動作し続けること
- 段階的な移行パスの提供

### 2. パフォーマンス
- 変数の増加による負荷増を避ける
- 効率的な更新アルゴリズム

### 3. ユーザビリティ
- 設定の複雑さを適切に管理
- 明確なドキュメンテーション

### 4. テスト
- 多様な設定パターンのテスト
- 異なるtmux環境での動作確認

---

この改善により、tmux-claude-liveはより柔軟で使いやすいツールになり、幅広いユーザーのニーズに対応できるようになります。