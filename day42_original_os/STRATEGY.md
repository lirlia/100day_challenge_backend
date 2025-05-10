## 0\. 全体像

| フェーズ | 到達目標                                       | 主要コンポーネント               | 参考章（MikanOS） |
| :------- | :--------------------------------------------- | :------------------------------- | :---------------- |
| Phase 1  | “Hello, kernel\!” が QEMU で起動                | UEFI ブートローダ, カーネルの main | Day 01–03         |
| Phase 2  | VGA/Framebuffer 文字表示 & 例外ハンドラ        | コンソール, IDT, PIC/IO-APIC     | Day 04–07         |
| Phase 3  | 物理メモリ管理 & ページング開始                | PMM, VMM, PML4 設定              | Day 08–12         |
| Phase 4  | タイマ割り込み & ラウンドロビン・スケジューラ | PIT/APIC, TSS, context switch    | Day 13–17         |
| Phase 5  | ELF 形式のユーザプロセス起動                   | Syscall, ユーザ空間, fork/exec   | Day 18–22         |
| Phase 6  | ミニシェル + echo / ls                         | 仮想ファイルシステム, デバイス層 | Day 23–28         |

**ゴール**
Phase 6 までを 8〜12 週で完走すると、質問に挙げられた機能セットが一通りそろいます。

-----

## 1\. ホスト環境（M1 Mac）構築

### 1.1. パッケージ管理

```bash
brew install llvm qemu gnu-sed coreutils cdrtools
```

### 1.2. クロスツールチェーン (x86\_64-elf)

  * Homebrew 公式フォーミュラではなく `osdev-binutils` や `osdev-gcc` を使うと衝突しにくい。
  * MikanOS と同じく Intel 64（x86\_64） をターゲットにするのが学習コスト・情報量ともに有利。
      * aarch64 ネイティブで書きたい場合は Limine + UEFI の手順が大幅に変わるので要相談。

### 1.3. Python / Ninja (ビルドスクリプト用)

-----

## 2\. ブートチェーン

| レイヤ       | 採用候補                      | 理由                                             |
| :----------- | :---------------------------- | :----------------------------------------------- |
| FW           | UEFI (OVMF.fd for x86\_64)     | Apple Silicon + QEMU でも 安定／BIOS不要         |
| ブートローダ | - MikanLoaderPkg (そのまま流用)\<br\>- Limine (最新 UEFI 対応) | 前者は教科書どおりに追従しやすい／後者は Starters が多い |
| カーネル     | C (一部 asm)                  | ご希望に合わせ C に統一（MikanOS は C++）        |

MikanOS のブートローダ部は UEFI アプリとして実装されており、Apple Silicon + QEMU の組み合わせでも動作確認例が多い。

-----

## 3\. 推奨ツール & ライブラリ

| 目的         | ツール              | メモ                                           |
| :----------- | :------------------ | :--------------------------------------------- |
| GCC/Clang    | llvm (Clang + lld)  | LLD はリンクスクリプト不要で --lto が楽      |
| アセンブラ   | nasm または gnu as  | UEFI スタブ程度なら最小で済む                  |
| デバッグ     | gdb-multiarc, lldb  | QEMU -s -S でリモート接続                      |
| イメージ生成 | xorriso, mtools, objcopy | fat12.img or esp.qcow2                         |
| CI           | GitHub Actions + brew | M1 ローカルとの差分を最小化                      |
| ドキュメント | mkdocs or mdBook    | 日々のメモを HTML 化                           |

-----

## 4\. フェーズ別タスク詳細

### Phase 1 — “Hello, kernel\!”

`[UEFI] → MikanLoaderPkg → Kernel C entry`

  * UEFI アプリ (EFIAPI efi\_main) で LoadKernel.efi を読み込み
  * GDT + Long mode 切り替え
  * QEMU 起動コマンド例

<!-- end list -->

```bash
qemu-system-x86_64 \
  -machine q35,accel=hvf \
  -cpu host \
  -m 512M \
  -drive if=pflash,format=raw,unit=0,file=OVMF_CODE.fd,readonly=on \
  -drive if=pflash,format=raw,unit=1,file=OVMF_VARS.fd \
  -drive format=raw,file=fat:rw:./hddimg
```

### Phase 2 — 画面出力 & 例外

  * UEFI から framebuffer 情報を受け取り、簡易 printf 実装
  * IDT を設定して \#DE/\#GP などを自前でハンドリング
  * 構造体：`struct FrameBuffer`, `struct IDTR`, `struct InterruptFrame`

### Phase 3 — 物理/仮想メモリ

  * UEFI Memory Map → ビットマップ PMM (alloc\_page / free\_page)
  * 4 level page table を動的生成、カーネルを Higher Half (0xFFFF8000\_00000000) に再配置
  * CR3 切替で仮想メモリ有効化 → `fork( )` への布石

### Phase 4 — スケジューラ

  * APIC タイマ (x2APIC) 100 Hz 割り込み
  * `struct Task { regs_t regs; uint64_t *stack; ... }`
  * 単純 ラウンドロビン で `task_switch()`
  * `sleep()` はタイマティック方式で実装

### Phase 5 — ユーザプロセス & Syscall

  * ELF64 loader: `.text/.data` をユーザ空間 (例 `0x00000000400000`) にマッピング
  * `int 0x80` 風に `sys_write`, `sys_exit` など実装
  * `init` プロセスから `/bin/sh` を `fork+exec`

### Phase 6 — シェル & コマンド

  * ミニシェル (`char *readline()`, `parse(argv)`, `exec`)
  * 仮想 FS 層
  * RAMFS を root に
  * `/dev/console`, `/proc/meminfo` などはデバイスファイル
  * `ls`: RAMFS のディレクトリエントリ列挙
  * `echo`: `write(1, argv[1], ...)`

-----

## 5\. QEMU (Apple Silicon) Tips

| 課題                         | 対応策                                              |
| :--------------------------- | :-------------------------------------------------- |
| HVF は x86\_64 ゲストでしか使えず若干遅い | `-accel hvf` を有効にするだけで JIT 化され 3–5 倍高速 |
| VGA 出力が崩れる             | OVMF の解像度を固定 (`-display cocoa,gl=off`)       |
| GDB でレジスタ名が違う       | `target remote :1234` 後に `set architecture i386:x86-64` |

-----

## 6\. 参考リソース

  * [Deep Wiki / MikanOS](https://www.google.com/search?q=https://wiki.deep-explorer.net/mikanos) — 日本語で UEFI-OS 開発を解説。図解が豊富。
  * [MikanOS GitHub](https://github.com/uchan-nos/mikanos) — 完全な C++ ソースとブートチェーン。ビルドスクリプトも公開。
  * [Limine Bootloader](https://github.com/limine-bootloader/limine) — 最新 UEFI/BIOS 両対応の汎用ブートローダ。
  * [osdev.org Wiki](https://wiki.osdev.org/Main_Page) — ページング・割り込み・APIC の実装例が豊富。

-----

## 7\. 次のアクション

1.  **ターゲットアーキテクチャ確認**
      * 本計画は x86\_64 ゲスト を前提にしています。
      * aarch64 ネイティブ で行いたい場合はブートローダから変更が必要です。
2.  **フェーズ 1 の環境セットアップ**
      * Homebrew でクロスツールチェーンを導入し、`hello_kernel.efi` が起動するまでをゴールに。
3.  **疑問点・追加要望があれば教えてください！**
      * 例: 「C++ でも良い？」「シェルにパイプ機能を入れたい」など

-----

🎉 Happy hacking\!