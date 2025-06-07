# Day60 - Mini OS with Shell Implementation Progress

## プロジェクト概要
QEMUで動作する独自OSを実装。独自シェルをユーザーモードで動作させることが目標。

## 技術スタック
- **言語**: C言語 + inline assembly (x86-32bit)
- **エミュレータ**: QEMU
- **ビルド**: Makefile + GCC cross-compiler (x86_64-elf-gcc)
- **確認方法**: QEMUシリアル出力をファイル保存 → read_file で確認
- **メモリ管理**: ビットマップベースのページフレームアロケータ

## 作業工程と完了状況

### ✅ Phase 1: Bootloader (Multiboot)
- [x] Multiboot header implementation
- [x] Basic kernel entry point  
- [x] 32-bit protected mode setup
- [x] Basic memory detection

### ✅ Phase 2: Kernel basics (printf, panic, strings)
- [x] VGA text mode driver
- [x] kernel_printf implementation
- [x] Basic string functions (strlen, strcmp, memcpy, memset)
- [x] Panic and halt functionality

### ✅ Phase 3: Physical memory (256MB, page allocator)  
- [x] Memory manager initialization
- [x] Page allocator (4KB pages)
- [x] 256MB memory support with fallback
- [x] Bitmap-based page tracking (65536 pages)
- [x] Memory allocation/deallocation testing
- [x] Page marking for kernel sections

### ✅ Phase 4: Process management (PID, scheduler, context switch)
- [x] Process Control Block (PCB) structure
- [x] Process creation and management
- [x] Basic round-robin scheduler
- [x] Context switching (assembly implementation)
- [x] 8KB stack allocation per process
- [x] Process listing and state management

### ✅ Phase 5: Interrupt processing (IDT, PIC, exception handlers)
- [x] Interrupt Descriptor Table (IDT) setup
- [x] Exception handlers (division error, GP fault, page fault)
- [x] PIC (Programmable Interrupt Controller) initialization
- [x] Basic interrupt stubs (assembly)
- [x] System call infrastructure (int 0x80)
- [x] Timer interrupt framework (disabled for stability)

### ✅ Phase 6: Virtual memory foundation (paging structures, mapping functions)
- [x] Paging structures (page directory, page tables)
- [x] 2-level paging system (4GB virtual address space)
- [x] Page mapping/unmapping functions
- [x] TLB management and page invalidation
- [x] Memory protection flags
- [x] Virtual memory foundation complete (initialization pending)

### ✅ Phase 7: User mode foundation (privilege levels, GDT, TSS)
- [x] User mode structures and definitions
- [x] GDT (Global Descriptor Table) setup framework
- [x] TSS (Task State Segment) structure
- [x] Privilege level management (Ring 0/Ring 3)
- [x] System call handler registration
- [x] User mode transition framework

### ✅ Phase 8: Keyboard input and shell foundation
- [x] **Keyboard driver implementation**
  - [x] PS/2 keyboard controller support
  - [x] Scancode to ASCII conversion
  - [x] US keyboard layout mapping
  - [x] Shift key support
  - [x] Input buffer management (256 chars)
  - [x] IRQ1 interrupt handling
- [x] **Shell program foundation**
  - [x] Command parsing and execution
  - [x] Basic commands (help, version, memory, uptime, exit)
  - [x] System call interface (write, getchar, exit)
  - [x] Interactive command line structure
- [x] **Integration testing**
  - [x] Kernel mode shell execution
  - [x] System information display
  - [x] All subsystems operational verification

### 🚧 Phase 9: User Mode Shell (GDT/TSS enablement) - **NEXT TARGET**
- [ ] Enable GDT (Global Descriptor Table)
- [ ] Enable TSS (Task State Segment) 
- [ ] User mode privilege switching
- [ ] Interactive shell in user mode
- [ ] Real-time keyboard input processing
- [ ] Command execution in user space

### 🚧 Phase 10: Advanced Shell Features - PLANNED
- [ ] File system commands
- [ ] Process management commands
- [ ] Memory inspection tools
- [ ] System monitoring utilities

---

## 🏆 **現在の成果 (Phase 8完了)**

### **✅ 完全動作中のコンポーネント**
- **Memory Management**: 256MB, page allocator, bitmap tracking
- **Process Management**: PCB, scheduler, context switching
- **Interrupt System**: IDT, PIC, exception handling, system calls
- **Keyboard Driver**: PS/2 support, ASCII conversion, input buffering
- **Shell Foundation**: Command parsing, system calls, kernel mode execution

### **🔧 現在のアーキテクチャ**
```
=====================================
    Mini OS Shell v1.0 RUNNING
=====================================
Features available:
  - Memory Management: 256MB
  - Process Management: 2 processes  
  - Interrupt System: Fully operational
  - Keyboard Driver: Initialized
  - User Mode: Ready (GDT/TSS pending)
```

### **📊 技術仕様**
- **Memory**: 65536 pages (4KB each), ~84KB kernel footprint
- **Processes**: 2 active processes (idle, test_a), 8KB stacks
- **Interrupts**: 256-entry IDT, system call vector 0x80, IRQ1 keyboard
- **Input**: PS/2 keyboard driver, 256-character circular buffer
- **Shell**: 6 basic commands, extensible command architecture

### **🎯 次のマイルストーン**
**User Mode Shell**: Enable GDT/TSS to run shell in Ring 3 with full privilege separation and interactive keyboard input.

## ファイル構成 (最新)

```
day60_mini_os/
├── src/
│   ├── boot/multiboot_kernel.asm     # Multiboot エントリポイント
│   ├── kernel/
│   │   ├── main.c                    # カーネル メイン + テスト統合
│   │   ├── memory.c                  # 物理メモリ管理
│   │   ├── process.c                 # プロセス管理 & スケジューラ
│   │   ├── interrupt.c               # 割り込み処理 & システムコール
│   │   ├── usermode.c                # ユーザーモード管理
│   │   ├── paging.c                  # 仮想メモリ（基盤）
│   │   ├── string.c                  # 文字列操作
│   │   ├── context_switch.asm        # コンテキストスイッチ
│   │   ├── interrupt_stubs.asm       # 割り込みスタブ
│   │   ├── paging_asm.asm           # ページング制御
│   │   └── usermode_asm.asm         # ユーザーモード切り替え
│   ├── drivers/
│   │   ├── keyboard.c               # キーボードドライバ 🆕
│   │   └── serial.c                 # シリアル出力
│   ├── user/
│   │   └── shell.c                  # シェルプログラム 🆕
│   └── include/
│       ├── kernel.h                 # カーネル共通定義
│       ├── memory.h                 # メモリ管理API
│       ├── process.h                # プロセス管理API
│       ├── interrupt.h              # 割り込み処理API
│       ├── usermode.h               # ユーザーモードAPI
│       ├── paging.h                 # ページングAPI
│       └── keyboard.h               # キーボードAPI 🆕
├── build/                           # ビルド出力
├── Makefile                         # ビルド設定
├── linker.ld                        # メモリレイアウト
└── PROGRESS.md                      # 進捗管理
```

## 各フェーズのテスト方法

1. **ビルドテスト**: `make clean && make`
2. **実行テスト**: `qemu-system-x86_64 -kernel build/kernel.bin -serial stdio`
3. **メモリテスト**: alloc_page/free_page サイクル確認
4. **機能テスト**: 各フェーズごとに特定機能の動作確認

## 学習ポイント

- **低レベルプログラミング**: アセンブリ、メモリ直接操作
- **OS理論実践**: プロセス、メモリ、スケジューリング
- **ハードウェア制御**: 割り込み、デバイスドライバ
- **システムプログラミング**: カーネル空間とユーザー空間の分離
- **デバッグ技術**: QEMUデバッガ、シリアル出力ログ
- **メモリ管理**: ビットマップアルゴリズム、ページアライメント
