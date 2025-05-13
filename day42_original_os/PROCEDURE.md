# Day42 OS開発手順と用語解説

## 1. はじめに

Day42では、x86-64アーキテクチャ向けのシンプルなOSカーネルを作成し、QEMUエミュレータ上で起動して画面に文字を表示することを目標としました。
このドキュメントは、その過程で行った具体的な手順と、関連する主要な技術用語について解説し、理解を深めることを目的としています。

## 2. 主要な用語解説

- **OS (Operating System / オペレーティングシステム):**
  コンピュータのハードウェア（CPU、メモリ、ディスクなど）とソフトウェアリソースを効率的に管理し、ユーザーやアプリケーションに対して統一的なインターフェースを提供する基本的なソフトウェアです。OSがなければ、アプリケーションはハードウェアを直接制御する必要があり、開発が非常に複雑になります。

- **カーネル (Kernel):**
  OSの中核部分であり、最も低いレベルでハードウェアと対話します。主な役割は以下の通りです。
    - プロセス管理: プログラムの実行を管理し、CPU時間を割り当てます。
    - メモリ管理: 各プロセスが使用するメモリ空間を割り当て、保護します。
    - デバイスドライバ: ハードウェアデバイス（キーボード、ディスク、ネットワークカードなど）を制御するためのインターフェースを提供します。
    - システムコール: アプリケーションがカーネルの機能を利用するための窓口を提供します。

- **ブートローダー (Bootloader):**
  コンピュータの電源が投入された後、OSを起動するための小さなプログラムです。通常、マザーボード上のファームウェア（BIOSやUEFI）によって最初に呼び出され、ハードディスクなどのストレージデバイスからOSのカーネルイメージをメモリに読み込み、カーネルの実行を開始させます。

- **Limine:**
  今回使用したモダンなx86およびx86-64アーキテクチャ向けのブートローダーです。シンプルな設定ファイルに基づいてカーネルをロードし、起動時にカーネルが必要とする様々な情報（メモリマップ、フレームバッファ情報、ACPIテーブルなど）を提供してくれます。

- **BIOS (Basic Input/Output System):**
  PC/AT互換機などで伝統的に使われてきたファームウェアです。マザーボード上のROMチップに格納されており、電源投入時にハードウェアの初期化（POST: Power-On Self Test）を行い、ブートデバイスからブートローダーを読み込んで実行します。

- **UEFI (Unified Extensible Firmware Interface):**
  BIOSの後継として策定された、より高機能で柔軟なファームウェアインターフェースです。セキュアブート機能、大きなディスクのサポート、グラフィカルなブートメニューなどが特徴です。LimineはBIOSとUEFIの両方に対応しています。

- **フレームバッファ (Framebuffer):**
  画面に表示される内容をピクセル単位で保持するメモリ領域のことです。このメモリ領域に直接ピクセルデータを書き込むことで、画面に画像や文字を描画できます。VGAテキストモードのようなハードウェアに依存した表示方法ではなく、より柔軟なグラフィック表示が可能です。Limineは初期化済みのフレームバッファ情報をカーネルに渡してくれます。

- **ピッチ (Pitch / Stride):**
  フレームバッファにおいて、画面の一行分のデータが占めるバイト数を指します。通常は「画面の横幅ピクセル数 × 1ピクセルあたりのバイト数」と一致しますが、メモリのアライメント（特定のアドレス境界にデータを配置すること）のために、実際の横幅よりも大きな値になることがあります。描画位置を計算する際に重要になります。

- **リンカスクリプト (Linker Script):**
  ソースコードをコンパイルして得られた複数のオブジェクトファイル（機械語コードやデータのかたまり）を、最終的な実行可能ファイル（今回の場合はカーネルイメージ `kernel.elf`）にどのように配置するかをリンカ（ldコマンドなど）に指示するための設定ファイルです。カーネルのメモリ上の開始アドレス（ベースアドレス）、各セクション（コードセクション `.text`、データセクション `.data`、BSSセクション `.bss` など）の配置順序やアライメントなどを定義します。

- **QEMU (Quick Emulator):**
  様々なCPUアーキテクチャ（x86, ARM, MIPSなど）のマシン全体をエミュレートできるオープンソースのソフトウェアです。OS開発においては、作成中のOSを実機に書き込むことなく、PC上で手軽に起動テストやデバッグを行うために広く利用されます。

- **ISOイメージ (.iso file):**
  CD-ROMやDVD-ROMなどの光学ディスクの内容を一つのファイルにまとめたアーカイブファイルフォーマットです。ブート可能なOSのイメージを配布したり、QEMUのようなエミュレータで仮想的な光学ドライブとしてマウントしたりするのによく使われます。今回は、Limineとカーネルを含んだブート可能なISOイメージを作成しました。

- **ビットマップフォント (Bitmap Font):**
  文字の形を、ピクセルの集まり（ビットマップイメージ）として定義したフォントです。各文字は固定サイズのグリッド（例: 8x8ピクセル、16x16ピクセル）で表現されます。実装が比較的単純で、OSの初期段階や組み込みシステムなどでよく利用されます。今回は8x8ピクセルのASCII文字セットを使用しました。

- **GDT (Global Descriptor Table):**
  x86アーキテクチャにおいて、プロテクトモードやロングモードでメモリセグメント（コードセグメント、データセグメントなど）の属性（ベースアドレス、リミット、アクセス権など）を定義するディスクリプタを格納するテーブルです。OSがメモリ空間を管理し保護するために不可欠です。

- **IDT (Interrupt Descriptor Table):**
  x86アーキテクチャにおいて、割り込みや例外が発生した際にCPUがどの処理ルーチン（割り込みハンドラ）を呼び出すべきかを定義するディスクリプタを格納するテーブルです。ハードウェア割り込み（キーボード入力、タイマーなど）やソフトウェア例外（ゼロ除算、ページフォルトなど）に対応するために必要です。

## 3. 実行した手順

以下に、Day42でOSカーネルを起動し、画面に文字を表示させるまでに行った主要な手順を時系列で示します。

### 3.1. プロジェクト初期設定とブートローダーの導入

1.  **作業ディレクトリと関連ファイルの準備:** OS開発のための基本的なディレクトリ構造 (`kernel/`, `image/`, `scripts/`) を作成しました。
2.  **Limineブートローダーの取得:** モダンなブートローダーであるLimineのv9.x-binaryリリースをクローンし、プロジェクト内に配置しました (`day42_original_os/limine/`)。これにより、自前で複雑なブートストラップコードを書く手間を省きます。
3.  **Limine設定ファイルの作成 (`image/limine.conf`):** Limineに対して、カーネルイメージの場所や起動時のオプションを指示する設定ファイルです。
    ```conf
    TIMEOUT=5
    DEFAULT_ENTRY=1

    :KERNEL(kernel)
    COMMENT=My Custom Kernel
    PROTOCOL=limine
    KERNEL_PATH=boot:///boot/kernel.elf
    # KERNEL_CMDLINE=Hello
    ```
    - `TIMEOUT=5`: 起動メニューの表示時間（秒）。
    - `KERNEL_PATH=boot:///boot/kernel.elf`: ISOイメージ内の `/boot/kernel.elf` をカーネルとしてロードするよう指定。
4.  **Makefileの初期作成:** カーネルのコンパイル、ISOイメージの作成、QEMUでの実行を自動化するための `Makefile` を作成しました。
    - **カーネルのコンパイル:** Cソースコード (`kernel/main.c`) を `x86_64-elf-gcc` (クロスコンパイラ) でコンパイルし、リンカスクリプト (`scripts/linker.ld`) を用いて `kernel.elf` (ELF形式の実行ファイル) を生成します。
    - **ISOイメージの作成:**
        - 必要なファイル (Limineのブートローダーファイル、設定ファイル、カーネルイメージ) を一時ディレクトリにコピー。
        - `xorriso` コマンドを使って、これらのファイルからブート可能なISOイメージ (`image/os.iso`) を生成します。El Torito規格に準拠し、BIOSブートとUEFIブートの両方に対応する設定を行いました。
        - `limine bios-install image/os.iso` コマンドを実行して、ISOイメージにBIOSブート用の情報を埋め込みます。
    - **QEMUでの実行:**
        - `make run-bios`: BIOSモードでQEMUを起動 (`-machine pc`)。
        - `make run-uefi`: UEFIモードでQEMUを起動 (`-machine q35 -bios OVMF_CODE.fd`)。

### 3.2. 最小限のカーネル作成 (エントリーポイントとフレームバッファ要求)

1.  **カーネルソースファイル (`kernel/main.c`):**
    - C言語で記述。OSの本体となるコードです。
    - Limineが提供するヘッダーファイル (`limine.h`) をインクルードします。これはLimineから情報を受け取るために必要です。
2.  **エントリーポイント (`_start`):** カーネルが最初に実行する関数です。`Makefile` 中のリンカ設定で、この `_start` シンボルをカーネルのエントリーポイントとして指定します。
3.  **フレームバッファ要求:**
    ```c
    static volatile struct limine_framebuffer_request framebuffer_request = {
        .id = LIMINE_FRAMEBUFFER_REQUEST,
        .revision = 0
    };
    ```
    - Limineに対して、「フレームバッファの情報が欲しい」と要求するための構造体です。
    - `.id = LIMINE_FRAMEBUFFER_REQUEST` で要求の種類を指定します。
    - `volatile` キーワードは、コンパイラによる最適化でこの変数が消されたり、アクセスが省略されたりするのを防ぎます。
    - `static` とすることで、この変数のスコープをファイル内に限定します。
    - この構造体を特定のセクション (`.requests`) に配置することで、Limineが起動時にこれを見つけて処理します。
4.  **リンカスクリプト (`scripts/linker.ld`):**
    ```ld
    ENTRY(_start)
    SECTIONS
    {
        . = 0xffffffff80000000;
        _kernel_start = .;

        .text : ALIGN(4K) {
            *(.text .text.*)
        }

        .requests : ALIGN(4K) {
            *(.requests)
        }
        KEEP(*(.requests))

        .rodata : ALIGN(4K) {
            *(.rodata .rodata.*)
        }

        .data : ALIGN(4K) {
            *(.data .data.*)
        }

        .bss : ALIGN(4K) {
            *(.bss .bss.*)
            *(COMMON)
        }

        _kernel_end = .;
    }
    ```
    - `ENTRY(_start)`: カーネルの実行開始点を `_start` 関数に指定。
    - `. = 0xffffffff80000000;`: カーネルがメモリ上にロードされるベースアドレス（開始番地）を指定。これはx86-64のHigher Half Kernel（カーネル空間をメモリの高位アドレスに置く設計）で一般的な値です。
    - `.requests` セクション: Limineへのリクエスト構造体を配置するための専用セクション。`KEEP(*(.requests))` で、未使用でも削除されないようにします。
    - その他、`.text` (コード)、`.rodata` (読み取り専用データ)、`.data` (初期化済みデータ)、`.bss` (未初期化データ) といった標準的なセクションを定義。

### 3.3. フレームバッファへの描画 (画面クリアと単色塗りつぶし)

1.  **フレームバッファ情報の取得:** `_start` 関数内で、Limineからのレスポンス (`framebuffer_request.response`) を確認し、利用可能なフレームバッファ (`framebuffers[0]`) の情報を取得します。
    - `address`: フレームバッファのメモリアドレス。
    - `width`: 画面の幅 (ピクセル数)。
    - `height`: 画面の高さ (ピクセル数)。
    - `pitch`: 画面の一行分のバイト数。
    - `bpp`: 1ピクセルあたりのビット数 (Bits Per Pixel)。
2.  **画面クリア処理:** 取得したフレームバッファ情報に基づき、画面全体を特定の色 (最初は青色 `0x0000FF`) で塗りつぶすループ処理を実装しました。
    ```c
    // 簡易的な画面クリア
    uint32_t *fb_ptr = (uint32_t *)framebuffer->address;
    for (uint64_t y = 0; y < framebuffer->height; y++) {
        for (uint64_t x = 0; x < framebuffer->width; x++) {
            fb_ptr[y * (framebuffer->pitch / 4) + x] = color;
        }
    }
    ```
    - `framebuffer->address` を `uint32_t` (32ビット符号なし整数) のポインタにキャストしてピクセル操作を行います (32bppを想定)。
    - `pitch` はバイト単位なので、`uint32_t` の配列としてアクセスするために4で割っています。
3.  **無限ループと`hlt`:** 画面描画後、CPUが停止しないように無限ループ (`for (;;) {}`) を配置し、その中で `asm volatile ("hlt")` を実行してCPUを低消費電力の停止状態にしました。これにより、QEMUが無駄にCPU資源を消費するのを抑えます。
4.  **QEMUでの動作確認:** `make run-bios` を実行し、QEMUの画面全体が指定した色で塗りつぶされることを確認しました。これが最初の画面出力成功です。

### 3.4. ビットマップフォントの導入と文字表示機能の実装

画面に意味のある情報を表示するため、文字描画機能を実装しました。

1.  **ビットマップフォントの用意:** シンプルな8x8ピクセルのモノクロームビットマップフォント (`font8x8_basic.h`) をWebで見つけ、プロジェクト (`kernel/font8x8_basic.h`) に追加しました。これは、ASCII文字コード0から127に対応する各文字のピクセルパターンを `uint8_t` の配列として定義したものです。
    ```c
    // font8x8_basic.h の一部 (例: 'A')
    static const uint8_t font8x8_basic[128][8] = {
        // ...
        { 0x00, 0x18, 0x24, 0x42, 0x7E, 0x42, 0x42, 0x00},   // U+0041 'A'
        // ...
    };
    ```
    各行の `uint8_t` 値が、文字の1行分の8ピクセルパターンを表します (1が前景ピクセル、0が背景ピクセル)。
2.  **`put_char` 関数の実装:** 指定された文字を、指定された座標に、指定された前景色・背景色で描画する関数です。
    - 入力: フレームバッファ情報、文字、描画開始X座標、描画開始Y座標、前景色(fg)、背景色(bg)。
    - 処理:
        - 文字コードに対応するフォントデータを `font8x8_basic` 配列から取得。
        - フォントデータの各行 (8行) についてループ。
        - 各行のビットパターン (8ビット) を1ビットずつチェック。
        - ビットが1ならフレームバッファの対応するピクセルに前景色を、0なら背景色を描画。
3.  **カーソル管理と `put_string` 関数の実装:** 画面上に連続して文字列を描画するための仕組みです。
    - グローバル変数としてカーソル位置 (`cursor_x`, `cursor_y`)、文字色 (`text_color`)、背景色 (`bg_color`) を導入。
    - `put_string` 関数:
        - 内部で `put_char` を呼び出し、一文字ずつ描画。
        - 描画後、`cursor_x` をフォント幅分進める。
        - 特殊文字の処理:
            - `\n` (改行): `cursor_x` を0に戻し、`cursor_y` をフォント高さ分進める。
            - `\r` (復帰): `cursor_x` を0に戻す。
        - 画面端での折り返し: `cursor_x` が画面幅を超えたら改行と同様の処理。
        - 画面下端でのスクロール (簡易版): `cursor_y` が画面高さを超えたら、画面全体をクリアし、カーソルを左上 (`0,0`) に戻す。
4.  **数値表示ユーティリティ (`put_hex`, `itoa_simple`):** デバッグ情報として数値（特に16進数）を表示するために、簡単な整数から文字列への変換関数と16進数表示関数を作成しました。
5.  **`_start` 関数からの呼び出し:** 画面クリア後、`put_string` や `put_hex` を使って、あいさつメッセージ、フレームバッファ情報、画面解像度などを表示するようにしました。

### 3.5. 文字サイズのスケーリング機能

8x8ピクセルのフォントは現代のディスプレイでは小さすぎるため、表示サイズを大きくする機能を実装しました。

1.  **スケーリング係数の導入:** `FONT_SCALE` というグローバル変数を導入し、文字の拡大率 (例: 2なら縦横2倍) を指定できるようにしました。
2.  **描画ロジックの変更 (`put_char`):**
    - フォントデータの1ピクセルを描画する際に、フレームバッファ上では `FONT_SCALE` x `FONT_SCALE` の矩形領域を指定色で塗りつぶすように変更しました。
    - これにより、元のフォントデータの解像度を保ちつつ、見た目のサイズを大きくできます。
3.  **実効フォントサイズの定義:** スケーリング後のフォントの幅と高さを `#define` マクロ (`EFFECTIVE_FONT_WIDTH`, `EFFECTIVE_FONT_HEIGHT`) で定義し、`put_string` でのカーソル移動や改行処理に利用するようにしました。

### 3.6. ビルドエラーとリンカエラーの修正

開発過程でいくつかのビルド関連の問題に遭遇し、修正を行いました。

1.  **`memcpy` 未定義エラー:**
    - **原因:** `-nostdlib` オプション付きでカーネルをコンパイルしているため、標準Cライブラリ関数 (`memcpy` など) がリンクされません。
    - **対策:** `kernel/main.c` 内に、自前の簡単な `memcpy` 関数を実装しました。
    ```c
    void *memcpy(void *dest, const void *src, size_t n) {
        uint8_t *pdest = (uint8_t *)dest;
        const uint8_t *psrc = (const uint8_t *)src;
        for (size_t i = 0; i < n; i++) {
            pdest[i] = psrc[i];
        }
        return dest;
    }
    ```
2.  **初期化子のコンパイル時定数エラー:**
    - **原因:** `static int EFFECTIVE_FONT_WIDTH = FONT_DATA_WIDTH * FONT_SCALE;` のようなグローバル/静的変数の初期化において、`FONT_SCALE` が実行時まで値が確定しない変数として扱われたため、「初期化子がコンパイル時定数ではない」というエラーが発生しました。
    - **対策:** `EFFECTIVE_FONT_WIDTH` と `EFFECTIVE_FONT_HEIGHT` を `static int` 変数から `#define` マクロに変更しました。マクロはプリプロセッサによって展開されるため、コンパイル時には定数値として扱われます。
    ```c
    #define EFFECTIVE_FONT_WIDTH (FONT_DATA_WIDTH * FONT_SCALE)
    #define EFFECTIVE_FONT_HEIGHT (FONT_DATA_HEIGHT * FONT_SCALE)
    ```

### 3.7. Gitへのコミット

ここまでの変更をGitリポジトリにコミットしました。主なコミット対象ファイルは以下の通りです。

- `kernel/main.c` (カーネル本体)
- `kernel/font8x8_basic.h` (ビットマップフォント)
- `kernel/limine.h` (Limineヘッダー)
- `Makefile` (ビルドスクリプト)
- `image/limine.conf` (Limine設定ファイル)
- `limine/` (Limineブートローダーファイル群)
- `scripts/linker.ld` (リンカスクリプト)
- `PROGRESS.md` (進捗管理ファイル)
- `README.md` (プロジェクト説明ファイル)

コミットメッセージ: `day42: feat: Implement basic console output with scalable 8x8 font`

### 3.8. シリアルポート出力の実装

フレームバッファへの出力に加えて、デバッグ情報をより簡単に確認できるようにするため、シリアルポート（COM1）への出力機能を実装しました。QEMUでは、シリアルポート出力をホストOSのターミナルにリダイレクトできます。

1.  **I/Oポートアクセス用ヘルパー関数:**
    - `outb(port, value)`: 指定されたI/Oポートに1バイトのデータを書き込むインラインアセンブリ関数。
    - `inb(port)`: 指定されたI/Oポートから1バイトのデータを読み込むインラインアセンブリ関数。
2.  **シリアルポート定数とレジスタオフセットの定義:**
    - `SERIAL_COM1_BASE (0x3F8)`: COM1のベースI/Oポートアドレス。
    - データポート、FIFO制御ポート、ライン制御ポート、モデム制御ポート、ライン状態ポートのオフセットを定義。
3.  **`init_serial(port)` 関数の実装:**
    - 指定されたシリアルポートを初期化します。
    - ボーレートを38400に設定 (115200 / 3)。
    - データ形式を8ビット、パリティなし、ストップビット1 (8N1) に設定。
    - FIFOバッファを有効化。
4.  **シリアル文字送信関数の実装:**
    - `is_transmit_empty(port)`: 送信バッファが空かどうかをライン状態レジスタで確認します。
    - `write_serial_char(port, char)`: 送信バッファが空になるのを待ってから、1文字をデータポートに書き込みます。
    - `print_serial(port, string)`: 文字列を1文字ずつ `write_serial_char` を使って送信します。
5.  **`_start` 関数での呼び出し:**
    - カーネルの初期段階（フレームバッファ初期化よりも前）で `init_serial(SERIAL_COM1_BASE)` を呼び出し。
    - `print_serial` を使って、初期化メッセージやデバッグ情報をシリアルポートに出力。
6.  **Makefileの変更:**
    - QEMUの起動オプション (`QEMU_OPTS_BIOS`, `QEMU_OPTS_UEFI`) に `-serial stdio` を追加。これにより、QEMU内のCOM1がホストの標準入出力に接続され、ターミナルでシリアル出力を確認できるようになります。
7.  **動作確認:** QEMUを起動し、ターミナルに "Serial port initialized!" やその他のデバッグメッセージが表示されることを確認しました。

コミットメッセージ: `day42: feat: Implement serial port output (COM1)`

### 3.9. GDT (Global Descriptor Table) のセットアップ

Limineは既に基本的なGDTを提供してくれますが、OS自身でGDTを管理・設定できるようにするため、独自のGDTをセットアップしました。これにより、将来的にセグメント設定をより細かく制御できるようになります。

1.  **GDT関連ファイルの作成:**
    - `kernel/gdt.h`: GDTエントリ構造体 (`struct gdt_entry`)、GDTポインタ構造体 (`struct gdt_ptr`)、およびGDT初期化関数の宣言。
        - `struct gdt_entry` (8バイト): セグメントのベースアドレス、リミット、アクセス権、フラグなどを格納。`__attribute__((packed))` でパディングを無効化。
        - `struct gdt_ptr` (6バイト): GDTのサイズ (リミット) とベースアドレスを格納。`lgdt` 命令で使われる。`__attribute__((packed))`。
    - `kernel/gdt.c`: GDT本体の定義と初期化処理の実装。
2.  **GDTエントリの設定:**
    - `gdt_set_gate(num, base, limit, access, gran)`: 指定されたインデックスのGDTエントリを初期化するヘルパー関数。
        - `num`: GDTテーブル内のエントリ番号。
        - `base`: セグメントの32ビットベースアドレス。
        - `limit`: セグメントの20ビットリミット。
        - `access`: アクセス権バイト (P, DPL, S, Type)。
        - `gran`: グラニュラリティバイト (G, D/B, L, AVL)。
3.  **GDTの定義と初期化 (`init_gdt_impl`)**:
    - 静的な `struct gdt_entry gdt[3]` 配列としてGDTを定義。
    - **NULLディスクリプタ (エントリ0, セレクタ `0x00`):** CPUの要件により、最初のGDTエントリは常に0でなければなりません。
    - **カーネルコードセクション (エントリ1, セレクタ `0x08`):**
        - ベースアドレス `0x0`、リミット `0x0` (Lフラグにより無視される)。
        - アクセス権 `0x9A` (P=1, DPL=0, S=1, Type=Code, Execute/Read)。
        - グラニュラリティ `0x20` (L=1 (64-bit code segment), D/B=0, G=0)。
    - **カーネルデータセクション (エントリ2, セレクタ `0x10`):**
        - ベースアドレス `0x0`, リミット `0xFFFFF`。
        - アクセス権 `0x92` (P=1, DPL=0, S=1, Type=Data, Read/Write)。
        - グラニュラリティ `0xC0` (G=1 (リミットを4KiB単位), D/B=1 (32-bit segment), L=0)。
4.  **GDTのロード (`gdt_load_and_flush`)**:
    - GDTポインタ (`gdt_pointer`) にGDTのベースアドレスとリミットを設定。
    - インラインアセンブリで `lgdt` 命令を実行して、CPUに新しいGDTの場所を認識させます。
    - `lgdt` 実行後、セグメントレジスタ (CS, DS, ES, SS, FS, GS) を新しいセグメントセレクタで再ロードして、新しいGDT設定を有効にします。
        - CSは `lretq` (ロングリターン) を使ったトリックで更新 (`push <new_cs_selector>; push <return_address>; lretq`)。
        - その他のデータセグメントレジスタは `mov` 命令で直接更新。
5.  **`_start` 関数での呼び出し:** `init_serial` の後に `init_gdt()` を呼び出します。
6.  **Makefileの変更:**
    - `kernel/gdt.c` をコンパイル対象に追加。
    - `CFLAGS_KERNEL` に `-fPIE` (Position Independent Executable) を追加。
    - `LDFLAGS_KERNEL` に `-Wl,-Map=$(BUILD_DIR)/kernel.map` を追加してリンカマップファイルを生成。
7.  **動作確認:** QEMUを起動し、シリアル出力に "GDT initialized and loaded." が表示され、システムがクラッシュしないことを確認。

コミットメッセージ: `day42: feat: Implement basic GDT setup`

### 3.10. IDT (Interrupt Descriptor Table) と例外ハンドラのセットアップ

CPU例外（ゼロ除算、ページフォルトなど）やハードウェア割り込みを処理するためのIDTをセットアップし、基本的な例外ハンドラを実装しました。

1.  **IDT関連ファイルの作成:**
    - `kernel/idt.h`: IDTエントリ構造体 (`struct idt_entry`)、IDTポインタ構造体 (`struct idt_ptr`)、割り込みハンドラに渡されるレジスタ状態構造体 (`struct registers`)、割り込みハンドラの型定義、および関連関数の宣言。
        - `struct idt_entry` (16バイト for x86-64): ハンドラオフセット、セグメントセレクタ、IST、タイプ属性などを格納。`__attribute__((packed))`。
        - `struct idt_ptr` (10バイト): IDTのサイズ (リミット) とベースアドレスを格納。`lidt` 命令で使われる。`__attribute__((packed))`。
        - `struct registers`: 割り込み発生時にスタックに積まれる汎用レジスタ、割り込み番号、エラーコードなどを保持。
    - `kernel/idt.c`: IDT本体の定義、IDT初期化処理、汎用割り込みハンドラ (`isr_handler_c`)、および特定の例外ハンドラの実装。
    - `kernel/isr_stubs.s`: 各割り込みに対応する低レベルのアセンブリスタブの実装。
2.  **アセンブリ割り込みスタブ (`kernel/isr_stubs.s`):**
    - `.intel_syntax noprefix` を使用。
    - 共通のC言語ハンドラ `isr_handler_c` を `.extern` で宣言。
    - `ISR_NO_ERR_CODE` マクロ: エラーコードをプッシュしない例外 (0-7, 9, 15-19など) 用。スタックにダミーのエラーコード(0)と割り込み番号をプッシュし、`isr_common_stub` にジャンプ。
    - `ISR_ERR_CODE` マクロ: CPUがエラーコードをプッシュする例外 (8, 10-14, 17) 用。スタックに割り込み番号をプッシュし (エラーコードはCPUがプッシュ済み)、`isr_common_stub` にジャンプ。
    - `isr_common_stub`:
        - 汎用レジスタ (rax, rbx, ..., r15) をスタックにプッシュ (CPUが自動保存しないもの)。
        - スタックポインタ (`rsp`) を `rdi` レジスタに移動 (C呼び出し規約の第一引数)。
        - `call isr_handler_c` でC言語のハンドラを呼び出す。
        - レジスタを復元。
        - スタックから割り込み番号とエラーコードをクリーンアップ (`add rsp, 16`)。
        - `iretq` で割り込みから復帰。
    - `isr0` から `isr19` までの最初の20個の例外に対応するスタブを上記マクロを使って定義。
3.  **IDTエントリの設定 (`kernel/idt.c`):**
    - `idt_set_gate(num, base, sel, flags, ist)`: 指定された番号のIDTエントリを初期化。
        - `base`: アセンブリスタブ (`isrX`) のアドレス。
        - `sel`: コードセグメントセレクタ (GDTのカーネルコードセグメント `0x08`)。
        - `flags`: タイプ属性 (例: `0x8E` for 64-bit Interrupt Gate, P=1, DPL=0)。
        - `ist`: Interrupt Stack Table index (今回は0)。
4.  **汎用Cハンドラ (`isr_handler_c`):**
    - アセンブリスタブから呼び出され、`struct registers` を引数として受け取る。
    - シリアルポートに割り込み番号とエラーコードを出力（デバッグ用）。
    - `interrupt_handlers` 配列をチェックし、対応する割り込み番号にC言語の特定のハンドラが登録されていればそれを呼び出す。
    - 登録されていなければ、"No specific C handler" メッセージを表示し、`asm volatile ("cli; hlt");` でシステムを停止。
5.  **特定の例外用Cハンドラ:**
    - `divide_by_zero_handler` (ISR 0)
    - `general_protection_fault_handler` (ISR 13)
    - `page_fault_handler` (ISR 14): CR2レジスタからフォールトアドレスも表示。
    - これらのハンドラは、それぞれの例外に関するメッセージをシリアルに出力し、最後に `asm volatile ("cli; hlt");` でシステムを停止する。
6.  **IDTの初期化 (`init_idt`)**:
    - IDTポインタ (`idt_pointer`) にIDTのベースアドレスとリミットを設定。
    - `interrupt_handlers` 配列をクリア。
    - `idt_set_gate` を使って `isr0` から `isr19` までをIDTに登録。
    - `divide_by_zero_handler` などを `interrupt_handlers` 配列に登録。
    - インラインアセンブリで `lidt` 命令を実行して、CPUに新しいIDTの場所を認識させる。
7.  **`_start` 関数での変更:**
    - `init_gdt` の後に `init_idt()` を呼び出す。
    - IDTロード後、`asm volatile ("sti");` を実行して割り込みを有効化する。これは非常に重要。
8.  **Makefileの変更:**
    - `kernel/idt.c` と `kernel/isr_stubs.s` をコンパイル/アセンブル対象に追加。
    - アセンブラ (`AS_KERNEL`) とアセンブラフラグ (`ASFLAGS_KERNEL`) を定義。
    - `.s` ファイルを `.o` ファイルにアセンブルするルールを追加。
9.  **動作テスト（ゼロ除算例外）:**
    - `main.c` の `_start` 関数内で、割り込み有効化 (`sti`) の直後に意図的にゼロ除算 (`volatile int z = x / y;` where `y=0`) を行うコードを挿入。
    - ビルドして実行すると、シリアルコンソールに "Interrupt Received: 0", "EXCEPTION: Divide by Zero" と表示され、システムが停止することを確認。これによりIDTと例外ハンドラが機能していることを検証。

コミットメッセージ: `day42: feat: Implement IDT and basic exception handlers (0-19)`

### 3.11. 物理メモリマネージャ (PMM) の実装 (スタック方式)

Day43の作業として、カーネルが動的にメモリを確保・解放できるようにするための基礎となる物理メモリマネージャ (PMM) を実装しました。Limineから取得したメモリマップ情報を利用し、利用可能な物理ページを管理します。今回はシンプルなスタック（フリーリスト）方式を採用しました。

1.  **PMMの目的と設計:**
    - **目的:** OSが使用する物理メモリページを効率的に追跡し、要求に応じて割り当て、不要になったページを再利用可能にすること。
    - **スタック方式 (フリーリスト):** 利用可能な物理ページのアドレスをスタックに保持します。ページの割り当て時はスタックからポップし、解放時はスタックにプッシュします。実装が比較的単純です。

2.  **`kernel/pmm.h` の作成:**
    - `PAGE_SIZE` (4096バイト) と `PAGE_SHIFT` (12) を定義。
    - `pmm_state_t` 構造体を定義。PMMのフリーリストスタックのベースアドレス (`stack_base`)、現在のスタックポインタ (`stack_ptr`)、スタックの容量 (`capacity`)、現在の空きページ数 (`free_pages`)、初期の総利用可能ページ数 (`total_pages_initial`) を保持します。
    - PMM初期化関数 `void init_pmm(struct limine_memmap_response *memmap);`
    - 物理ページ割り当て関数 `void *pmm_alloc_page(void);`
    - 物理ページ解放関数 `void pmm_free_page(void *p);`
    - 空きページ数取得関数 `uint64_t pmm_get_free_page_count(void);`
    の各プロトタイプを宣言。

3.  **`kernel/pmm.c` の実装:**
    - **`init_pmm` 関数:**
        - **第1パス:** Limineからのメモリマップを走査し、`LIMINE_MEMMAP_USABLE` な全ページの総数を計算。これにより、フリーリストスタック自体がどれだけのメモリを必要とするかを見積もります (`pmm_stack_required_bytes`)。
        - **第2パス:** 再度メモリマップを走査し、計算したスタックサイズ (`pmm_stack_required_bytes`) を格納するのに十分な連続した `USABLE` な物理メモリ領域を探します。見つかった領域の先頭アドレス（ページアライン済み）を `pmm_info.stack_base` とし、`pmm_info.stack_ptr` もここに初期化します。
        - **第3パス:** 再度メモリマップを走査します。`USABLE` な各ページについて、それがPMMスタック自身が使用している領域でなければ、そのページのアドレスをフリーリストスタックにプッシュし (`*pmm_info.stack_ptr++ = page_addr;`)、`pmm_info.free_pages` をインクリメントします。
    - **`pmm_alloc_page` 関数:**
        - `pmm_info.free_pages` が0でなければ、`pmm_info.stack_ptr` をデクリメントし、そこにあるページアドレスを返します。`pmm_info.free_pages` もデクリメントします。
        - 空きページがなければ `NULL` を返します。
    - **`pmm_free_page` 関数:**
        - 与えられた物理アドレス (`p`) がページアラインされているかなどをチェックします。
        - `pmm_info.stack_ptr` にページアドレスを格納し、`pmm_info.stack_ptr` をインクリメントします。`pmm_info.free_pages` もインクリメントします。スタックオーバーフローもチェックします。
    - **`pmm_get_free_page_count` 関数:** `pmm_info.free_pages` を返します。
    - デバッグ用に、シリアルポート出力関数 (`print_serial`等) を `extern` 宣言して使用。

4.  **`kernel/main.c` でのPMM利用:**
    - `pmm.h` をインクルード。
    - `_start` 関数内で、Limineからメモリマップ応答を取得し、その情報を表示した後、`init_pmm(memmap_request.response);` を呼び出してPMMを初期化。
    - PMMの動作をテストするために、`pmm_alloc_page()` を複数回呼び出し、取得したページアドレスと残りの空きページ数をシリアル出力。その後 `pmm_free_page()` で一部ページを解放し、再度空きページ数を確認。最後に再度 `pmm_alloc_page()` を呼び出し、LIFO特性を確認するテストコードを追加。
    - `print_serial_hex` と `print_serial_utoa` 関数から `static` を削除し、`kernel/pmm.c` からもリンクできるように変更。

5.  **`Makefile` の変更:**
    - `kernel/pmm.c` を `KERNEL_C_SRCS` に追加し、コンパイル対象に含めました。

6.  **動作確認:**
    - QEMUでカーネルを起動し、シリアルコンソールに出力されるログを確認。
    - PMMが初期化され、計算された総ページ数、スタック配置アドレス、初期化後の空きページ数が正しく表示されることを確認。
    - ページ割り当て・解放テストにおいて、空きページ数が期待通りに増減し、解放されたページが再割り当てされる（LIFO動作）ことを確認。

コミットメッセージ: `day43: feat: Implement stack-based Physical Memory Manager (PMM)`

### 3.12. ページング準備: HHDMオフセット取得とページング構造定義

Day42の作業として、将来の4レベルページテーブル生成に向けた最初の準備を行いました。

1.  **HHDMオフセットの取得:**
    - `kernel/main.c` に `struct limine_hhdm_request` を追加し、LimineからHHDM (Higher Half Direct Map) オフセットを取得しました。
    - 取得したオフセットはグローバル変数 `hhdm_offset` に格納し、起動時にシリアルコンソールに出力して確認できるようにしました。
    - HHDMオフセットは、物理アドレスと仮想アドレスを相互に変換する際に重要となります。

2.  **ページング構造体の定義 (`kernel/paging.h`):**
    - 新しいヘッダーファイル `kernel/paging.h` を作成しました。
    - ページテーブルエントリ (PTE)、ページディレクトリエントリ (PDE)、ページディレクトリポインタテーブルエントリ (PDPTE)、PML4エントリ (PML4E) の型 (`uint64_t`) を定義しました。
    - `PAGE_SIZE` (4KiB) や、PTEの各種フラグ (Present, Writable, User, NoExecute など) をマクロで定義しました。
    - 仮想アドレスから各ページング構造のインデックスを計算するためのマクロ (`PML4_INDEX`, `PDPT_INDEX` など) を定義しました。
    - `hhdm_offset` の `extern` 宣言と、`init_paging()` 関数のプロトタイプ宣言を追加しました。

3.  **ページング初期化関数の準備 (`kernel/paging.c`):**
    - 新しいソースファイル `kernel/paging.c` を作成しました。
    - `init_paging()` 関数の初期実装として、以下の処理を行いました:
        - PMM (`pmm_alloc_page()`) を使用して、PML4テーブルのための物理ページを1つ確保。
        - 確保したPML4テーブルの物理アドレスと、HHDMオフセットを用いて計算した仮想アドレスをシリアルコンソールに出力。
        - PML4テーブル全体を0でクリア。
    - シリアルデバッグ出力のために `kernel/main.c` で定義されているシリアル関連関数 (`print_serial` 等) と `SERIAL_COM1_BASE` を `extern` 宣言して使用しました。

4.  **関連ファイルの更新:**
    - `kernel/main.c`:
        - `#include "paging.h"` を追加。
        - PMM初期化の後に `init_paging();` の呼び出しを追加。
    - `Makefile`:
        - `KERNEL_C_SRCS` に `kernel/paging.c` を追加し、コンパイル対象に含めました。

これにより、ページング機構を本格的に実装するための基本的なデータ構造と初期化処理の骨子が整いました。

### 3.13. 4レベルページングの有効化と高位アドレス空間への移行

物理メモリマネージャ(PMM)を基盤として、4レベルページングを有効にし、カーネルを高位アドレス空間（Higher Half）で実行するようにしました。この過程で複数の問題に直面し、段階的に解決しました。

1.  **ページング構造体の定義と初期化:**
    - `kernel/paging.h`, `kernel/paging.c` に、PML4, PDPT, PD, PTの各エントリ構造と、それらを操作するための関数 `map_page` を実装。
    - `init_paging` 関数内で、PMMを使い各ページング構造体テーブルのための物理ページを割り当て。

2.  **カーネル空間のマッピング:**
    - **HHDM (Higher Half Direct Map):** Limineから取得したHHDMオフセットを利用し、物理メモリ全体を仮想アドレス空間の高位（例: `0xffff800000000000` 以降）に直接マッピング。
    - **カーネルセクションのマッピング:** リンカスクリプトで定義されたカーネルの `.text`, `.rodata`, `.data`, `.bss` セクションを、HHDMオフセットではなく、カーネルのロード物理アドレス（Limineのメモリマップから取得）を基に、高位の仮想アドレス（例: `0xffffffff80000000` 以降）にマッピング。
    - **フレームバッファのマッピング:** Limineから取得した物理フレームバッファ領域を、HHDMオフセットを用いて仮想アドレス空間にマッピング。
    - **新しいカーネルスタックのマッピング:** PMMから数ページ確保し、高位の仮想アドレスにマッピング。新しいスタックポインタ (`new_rsp_virt_top`) を準備。

3.  **CR3ロードとコンテキストスイッチ:**
    - **IA32_EFER.NXEビットの有効化:** `rdmsr`, `wrmsr` を用いてMSR `0xC0000080` のNXEビット（No-Execute Enable）を立て、ページテーブルエントリのNXビットが機能するように設定。
    - **IDTの再マッピングとLIDT:** ページング有効後はIDTも仮想アドレスでアクセスする必要があるため、既存のIDT（物理アドレス）をHHDM内の新しい仮想アドレスにマッピングし直し、`lidt` 命令でIDTRを更新。
    - **旧スタックの一時マッピング:** CR3ロード直後、RSP切り替え前に発生する可能性のある割り込み/例外が古いスタックにアクセスしようとしてページフォルトするのを防ぐため、現在のRSPが指す物理ページを一時的に新しいPML4にマッピング。
    - **フレームバッファ構造体コピーのマッピング:** `kernel_main_after_paging` に渡すフレームバッファ構造体のコピーが格納されている物理ページを新しいPML4にマッピング。
    - **CR3レジスタへのPML4物理アドレスロード:** これで新しいページング構造が有効になる。
    - **パイプラインフラッシュ:** `jmp` 命令でCPUの命令パイプラインをフラッシュ。
    - **新しいスタックへの切り替え:** `mov rsp, new_rsp_virt_top` でスタックポインタを更新。
    - **高位アドレスの関数へのジャンプ:** 新しいスタック上で、高位アドレスに配置された `kernel_main_after_paging` 関数を呼び出し。

4.  **デバッグと問題解決:**
    - **初期のハングアップ:** CR3ロード直後にシステムが応答しなくなる。
    - **QEMUデバッグログの活用:** `-d int,guest_errors,cpu_reset,pgc` オプションで詳細な例外情報を取得。
    - **ページフォルトループの特定:** CR2レジスタの値とRIPから、不正なメモリアクセス箇所を特定。
    - **原因特定と修正の繰り返し:**
        - カーネルセクションの物理アドレス計算ミス（Limineのメモリマップ利用で修正）。
        - スタックポインタの初期値ミス。
        - NXEビット未設定による実行不可ページへのアクセス。
        - IDTがページング有効後にアクセス不能になる問題（IDT再マッピングとLIDTで修正）。
        - CR3ロード直後の旧スタックへのアクセスによるページフォルト（旧スタックの一時マッピングで対応）。
        - フレームバッファ記述子ページ未マッピングによるページフォルト（当該ページのマッピングで修正）。

5.  **高位アドレス空間でのフレームバッファ描画:**
    - `kernel_main_after_paging` 関数内で、渡されたフレームバッファ情報（仮想アドレス）を用いて、画面に "Hello, kernel from Higher Half!" を描画することに成功。

この一連の作業により、ページングが有効化され、カーネルが保護された高位メモリ空間で動作する基盤が整いました。

### 3.14. APIC タイマ割り込みの実装 (xAPIC フォールバック対応)

ページング有効化後、CPUのローカルAPIC (Advanced Programmable Interrupt Controller) を使用して周期的なタイマ割り込みを発生させる機能を実装しました。これは将来のマルチタスクスケジューラなどの時間ベースのイベント処理に不可欠です。

1.  **APIC関連ファイルの作成 (`kernel/apic.h`, `kernel/apic.c`):**
    *   APICレジスタ (xAPIC MMIO オフセットと x2APIC MSR アドレス) の定義。
    *   MSR (Model Specific Register) 読み書き用インライン関数 (`rdmsr`, `wrmsr`) を実装 (後に `msr.h` に移動)。
    *   LAPIC (Local APIC) 初期化関数 (`init_apic`) を実装:
        *   Limine から SMP (Symmetric Multi-Processing) 情報を取得。
        *   `IA32_APIC_BASE` MSR を読み取り、x2APIC モードが有効か (ブートローダ/HWが有効にしたか) を確認。
        *   **x2APIC モードの場合:** MSR ベースで LAPIC を設定。
        *   **xAPIC モードの場合:** 物理ベースアドレス (`0xFEE00000` 等) を取得し、その物理ページを `init_paging` 内で HHDM にマッピングするように要求。マッピングされた仮想アドレス (`apic_virt_base`) を使って MMIO (Memory-Mapped I/O) で LAPIC レジスタにアクセス。
        *   Spurious Interrupt Vector Register (SVR) を設定して LAPIC を有効化。
        *   APICタイマーを初期化: LVT Timer Register を設定し、周期モード (Periodic)、割り込みベクタ 32、分周器を設定。Initial Count Register に初期カウント値を設定してタイマを開始。
    *   LAPIC EOI (End of Interrupt) 送信関数 (`lapic_send_eoi`) を実装。割り込みハンドラの最後に呼び出す必要がある。
    *   割り込みハンドラから呼び出されるタイマ処理関数 (`timer_handler`) を実装。グローバルな `tick_counter` をインクリメントし、`lapic_send_eoi()` を呼び出す。

2.  **IDT の更新 (`kernel/idt.c`, `kernel/idt.h`, `kernel/isr_stubs.s`):**
    *   割り込みベクタ 32 (IRQ 0 に相当) に対応するアセンブリスタブ (`irq0_stub`) と IDT エントリを追加。
    *   汎用的な IRQ ハンドラ C 関数 (`irq_handler_c`) と、IRQ 0 専用の C ハンドラ (`timer_handler`) を `idt.c` に実装。
    *   `init_idt` でベクタ 32 に `timer_handler` を登録。

3.  **ページングでの xAPIC MMIO マッピング (`kernel/paging.c`):**
    *   `init_paging` 関数内で、`init_apic` より先に `IA32_APIC_BASE` MSR をチェック。
    *   x2APIC が無効な場合、MSR から APIC の物理ベースアドレスを取得し、`map_page` を使ってその物理ページを HHDM 内の仮想アドレス (`apic_virt_base`) にマッピングする処理を追加。ページキャッシュ無効 (`PTE_PCD`, `PTE_PWT`) フラグを設定。

4.  **メイン処理 (`kernel/main.c`):**
    *   `kernel_main_after_paging` で `init_apic` を呼び出す。
    *   割り込みを有効化 (`sti`)。
    *   メインループ内で `tick_counter` の値を画面に表示し、タイマー割り込みによって値がインクリメントされることを確認。

5.  **Makefile の更新:**
    *   `apic.c` をコンパイル対象に追加。
    *   QEMU 起動オプションに `-cpu SandyBridge,+x2apic` を追加し、エミュレートする CPU が x2APIC をサポートするように設定 (しかし MSR 読み取りにより最終的に xAPIC モードで動作)。

6.  **デバッグと問題解決:**
    *   **x2APIC / xAPIC 判定:** 最初は x2APIC を期待していたが、QEMU/Limine の設定により xAPIC モードで起動。`IA32_APIC_BASE` MSR のビットを正しく確認し、MMIO ベースのアドレスを取得・マッピングするロジックを追加して対応。
    *   **ページフォルト:** xAPIC の MMIO アドレスへのアクセス時にページフォルトが発生。`init_apic` でマッピングするのではなく、`init_paging` で事前にマッピングすることで解決。
    *   **ビルドエラー:** ヘッダファイルのインクルード不足 (`paging.h` in `apic.h`) や、グローバル変数のスコープ問題 (`kernel_pml4_phys` 等) を修正。

### 3.15. 文字表示の左右反転修正

APIC タイマーのカウント表示を実装した際、画面上の文字が左右反転して表示される問題が発覚しました。

1.  **原因調査:** `put_char` 関数内でビットマップフォントデータを処理する際のビット走査順序に問題があると推測。
2.  **修正 (`kernel/main.c` の `put_char`):**
    *   フォントデータの各行 (8ビット) を処理する内部ループ (`cx`) において、ビットマスクの生成方法を変更。
    *   当初は最上位ビット (MSB) からチェック (`1 << (FONT_DATA_WIDTH - 1 - cx)`) していたが、これを最下位ビット (LSB) からチェック (`1 << cx`) するように修正したところ、文字が正しく表示されるようになった。

```c
// 修正前 (MSBから)
// uint32_t pixel_color = (row_bits & (1 << (FONT_DATA_WIDTH - 1 - cx))) ? text_color : bg_color;
// 修正後 (LSBから)
uint32_t pixel_color = (row_bits & (1 << cx)) ? text_color : bg_color;
```

## 4. 現状と次のステップ

これで、Day42およびDay43前半の目標であった、Limineブートローダーを用いたx86-64カーネルの起動、フレームバッファへのテキスト表示（スケーリング対応）、シリアルポート出力、GDTのセットアップ、IDTと基本的なCPU例外ハンドラの実装、そしてスタック方式での物理メモリマネージャ(PMM)の実装が完了しました。

今後の拡張としては、以下のようなものが考えられます。
- PIC (Programmable Interrupt Controller) の無効化とAPIC (Advanced PIC) の設定。
- ハードウェア割り込み（タイマー、キーボードなど）の処理。
- より高度なメモリ管理：
    - **ページングの有効化:** 4レベルページテーブルの構築とCR3レジスタへの設定。
    - **カーネルヒープの実装:** PMMから取得したページを使って、より小さな単位でのメモリ割り当て (kmalloc/kfree) を可能にする。
    - 仮想メモリアドレス空間の設計。
- 簡単なスケジューラとプロセス管理。
- ファイルシステムの実装。

これらはより複雑なOS機能の基盤となります。
