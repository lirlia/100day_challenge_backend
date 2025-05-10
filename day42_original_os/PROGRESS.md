# OS開発プロジェクト進捗

## フェーズ別タスクリスト

### Phase 1: "Hello, kernel!" が QEMU で起動
- [x] UEFI ブートローダ (MikanLoaderPkg または Limine) のセットアップ
- [x] カーネルエントリーポイント (C言語) の作成
- [x] GDT (Global Descriptor Table) の設定
- [x] Long mode への切り替え
- [x] QEMU で "Hello, kernel!" の表示確認

### Phase 2: VGA/Framebuffer 文字表示 & 例外ハンドラ
- [x] UEFI から Framebuffer 情報取得
- [x] 簡易的な文字表示関数の実装 (printf ライク)
- [x] IDT (Interrupt Descriptor Table) の設定
- [x] 例外ハンドラの実装 (例: #DE, #GP)
- [x] 構造体定義: `struct FrameBuffer`, `struct IDTR`, `struct InterruptFrame`

### Phase 3: 物理メモリ管理 & ページング開始
- [x] UEFI Memory Map の解析と利用 (Limine経由で取得しPMMで使用)
- [x] 物理メモリマネージャ (PMM) の実装 (スタック/フリーリスト方式)
- [x] `alloc_page` / `free_page` 関数の実装
- [ ] 4レベルページテーブルの動的生成
- [ ] カーネルの Higher Half (例: `0xFFFF8000_00000000`) への再配置
- [ ] CR3 レジスタ切り替えによる仮想メモリ有効化

### Phase 4: タイマ割り込み & ラウンドロビン・スケジューラ
- [ ] APIC タイマ (x2APIC推奨) の設定 (例: 100Hz)
- [ ] タイマ割り込みハンドラの実装
- [ ] タスク構造体 (`struct Task`) の定義 (レジスタ状態, スタックポインタ等)
- [ ] タスク切り替え (`task_switch()`) 関数の実装
- [ ] ラウンドロビンスケジューリングアルゴリズムの実装
- [ ] `sleep()` 機能の実装 (タイマティック方式)

### Phase 5: ELF 形式のユーザプロセス起動
- [ ] ELF64 ローダーの実装
- [ ] `.text`, `.data` セクションのユーザー空間へのマッピング
- [ ] システムコールインターフェースの実装 (例: `int 0x80`)
- [ ] 基本的なシステムコール (`sys_write`, `sys_exit` など) の実装
- [ ] `init` プロセスの作成
- [ ] `fork` と `exec` (または同等の機能) の実装 (`init` から `/bin/sh` 起動目標)

### Phase 6: ミニシェル + echo / ls
- [ ] ミニシェルの実装
    - [ ] `readline()` (入力取得)
    - [ ] `parse()` (コマンド解析)
    - [ ] `exec()` (コマンド実行)
- [ ] 仮想ファイルシステム (VFS) 層の設計と実装
- [ ] RAMFS (RAMベースのファイルシステム) の実装とルートマウント
- [ ] デバイスファイルの実装 (例: `/dev/console`, `/proc/meminfo`)
- [ ] `ls` コマンドの実装 (RAMFS のディレクトリエントリ列挙)
- [ ] `echo` コマンドの実装 (`write(1, ...)` を使用)

## その他

- [x] ホスト環境構築 (クロスツールチェーン、QEMUなど)
- [x] ビルドスクリプトの整備
- [ ] デバッグ環境の確立 (GDB/LLDBリモートデバッグ)
