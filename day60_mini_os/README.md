# Day60 - Mini OS Implementation

QEMUで動作する独自のOS（オペレーティングシステム）を一から実装するプロジェクトです。

## プロジェクト概要

### 実装予定機能
- **ブートローダー**: QEMU上で起動可能な最小限のブートシーケンス
- **メモリ管理**: 物理メモリ管理 + 仮想メモリ（ページング）
- **プロセス管理**: マルチプロセス、プリエンプティブスケジューラ
- **システムコール**: カーネル/ユーザー空間の分離
- **独自シェル**: コマンドライン解析、プロセス起動
- **基本コマンド**: `echo`, `ls`, `ps`
- **簡易ファイルシステム**: 仮想的なディレクトリ構造

### 技術的特徴
- **言語**: C言語 + inline assembly (x86-64アーキテクチャ)
- **エミュレータ**: QEMU (リアルなハードウェア環境)
- **デバッグ方式**: シリアルポート出力をファイル保存
- **ビルド**: GCC cross-compiler + Makefile

## 学習目標

1. **OS内部構造の理解**
   - カーネル空間とユーザー空間の分離
   - プロセス間通信とメモリ保護
   - 割り込み処理とシステムコール

2. **低レベルプログラミング**
   - メモリ直接操作
   - アセンブリ言語との連携
   - ハードウェア抽象化

3. **システムプログラミング実践**
   - リアルタイムスケジューリング
   - ページング機構
   - デバイスドライバ開発

## プロジェクト構成

```
src/
├── boot/           # ブートローダー
├── kernel/         # カーネル本体
├── drivers/        # デバイスドライバ
├── fs/             # ファイルシステム
├── user/           # ユーザーランドプログラム
└── include/        # ヘッダファイル
```

## ビルド & 実行

```bash
# 開発環境構築（Phase 1完了後）
make setup

# ビルド
make clean && make

# QEMU上で実行
make run

# OS出力確認
cat output.log
```

## 開発フェーズ

詳細な開発計画は `PROGRESS.md` を参照してください。

### 主要マイルストーン
1. **Phase 2**: "Hello, OS!" 出力成功
2. **Phase 4**: 仮想メモリ動作確認
3. **Phase 6**: マルチプロセス実行
4. **Phase 10**: シェル対話開始
5. **Phase 11**: 全コマンド動作

## 技術仕様

- **アーキテクチャ**: x86-64
- **ページサイズ**: 4KB
- **スケジューラ**: Round Robin (時分割)
- **システムコール**: int 0x80 (Linux互換)
- **ファイルシステム**: 簡易Virtual FS

## デバッグ支援

```bash
# QEMU monitor での詳細確認
(qemu) info mem        # メモリマップ
(qemu) info registers  # CPU状態
(qemu) x/10i $rip      # 現在の命令

# カーネルからのデバッグ出力
kernel_printf("DEBUG: Process PID=%d scheduled\n", pid);
```

## 参考資料

- Intel 64 and IA-32 Architectures Software Developer's Manual
- QEMU System Emulation User's Guide  
- OSDev Wiki (https://wiki.osdev.org/)
- xv6 OS (MIT教育用OS)

---

**注意**: このプロジェクトは教育目的のOS実装です。プロダクション環境での使用は想定していません。
