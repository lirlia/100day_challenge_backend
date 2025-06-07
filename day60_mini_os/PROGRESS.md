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

### ✅ Phase 9: GDT/TSS enablement and User Mode foundation
- [x] **GDT (Global Descriptor Table) implementation**
  - [x] Kernel code segment (Ring 0)
  - [x] Kernel data segment (Ring 0) 
  - [x] User code segment (Ring 3)
  - [x] User data segment (Ring 3)
  - [x] TSS segment descriptor
- [x] **TSS (Task State Segment) setup**
  - [x] TSS structure initialization
  - [x] Kernel stack configuration
  - [x] I/O permission bitmap base
  - [x] TSS loading and activation
- [x] **User mode transition framework**
  - [x] Privilege level management (Ring 0/Ring 3)
  - [x] System call interface (int 0x80)
  - [x] User mode execution preparation

### ✅ Phase 10: Daemon System Implementation 🆕
- [x] **Daemon Process Architecture**
  - [x] Process structure extension for daemon support
  - [x] Daemon type enumeration (SYSTEM_MONITOR, HEARTBEAT, LOG_CLEANER, CUSTOM)
  - [x] Daemon-specific fields (interval, last_run, enabled, run_count)
- [x] **Daemon Management System**
  - [x] daemon_create() - create daemon processes with specified intervals
  - [x] daemon_start() / daemon_stop() - control daemon execution
  - [x] daemon_tick() - timer-driven execution checker
  - [x] daemon_list_all() - display daemon status in shell
  - [x] daemon_find_by_name() / daemon_find_by_type() - search functions
- [x] **Built-in Daemon Tasks**
  - [x] System Monitor daemon (20 tick interval)
    - [x] Memory usage monitoring (percentage calculation)
    - [x] Automatic execution via timer interrupts
  - [x] Heartbeat daemon (10 tick interval)
    - [x] System alive confirmation
    - [x] Uptime tracking and reporting
  - [x] Log Cleaner daemon (placeholder implementation)
- [x] **Timer Integration and Real-time Execution**
  - [x] Timer interrupt integration (2Hz precise timing)
  - [x] daemon_tick() called from timer interrupt handler
  - [x] Automatic daemon scheduling based on configured intervals
  - [x] Execution count tracking and statistics
- [x] **Shell Integration**
  - [x] 'daemon' command implementation
  - [x] Formatted daemon status display (PID, Name, Type, Status, Interval, Runs)
  - [x] console_write() output for proper shell display
  - [x] int_to_string() utility function for number formatting

### 🚧 Phase 11: Advanced System Features - PLANNED
- [ ] File system foundation
- [ ] Network stack basics
- [ ] Multi-threading support
- [ ] Advanced memory protection

---

## 🏆 **現在の成果 (Phase 10完了)**

### **✅ 完全動作中のコンポーネント**
- **Memory Management**: 256MB, page allocator, bitmap tracking
- **Process Management**: PCB, scheduler, context switching, daemon support 🆕
- **Interrupt System**: IDT, PIC, exception handling, system calls, timer 2Hz 🆕
- **Keyboard Driver**: PS/2 support, ASCII conversion, input buffering
- **Shell System**: Command parsing, system calls, 11 commands including 'daemon' 🆕
- **Daemon System**: Background process execution, system monitoring, heartbeat 🆕

### **🔧 現在のアーキテクチャ**
```
=====================================
    Mini OS Shell v1.0 with Daemons
=====================================
Features available:
  - Memory Management: 256MB
  - Process Management: 4 processes (2 daemons)
  - Interrupt System: Fully operational (2Hz timer)
  - Keyboard Driver: Interactive input
  - Daemon System: System monitoring + Heartbeat
  - Timer System: 23600+ ticks, precise scheduling
```

### **📊 技術仕様 (最新)**
- **Memory**: 65536 pages (4KB each), ~44KB current usage
- **Processes**: 4 active processes (idle, test_a, sysmon daemon, heartbeat daemon)
- **Interrupts**: 256-entry IDT, system call vector 0x80, IRQ1 keyboard, timer 2Hz
- **Daemons**: 2 active daemons with automatic execution
  - System Monitor: 1080+ executions, memory monitoring
  - Heartbeat: 2160+ executions, system alive confirmation
- **Input**: PS/2 keyboard driver, 256-character circular buffer
- **Shell**: 11 commands including real-time daemon status display

### **🎯 実装完了した主要機能**

#### **Core Operating System**
✅ **Multiboot kernel** - x86-32bit, 256MB memory support  
✅ **Memory management** - Page allocator, bitmap tracking, kernel protection  
✅ **Process management** - PCB, scheduler, context switching, 8KB stacks  
✅ **Interrupt system** - Complete IDT, PIC, exceptions, system calls  

#### **Device Drivers & I/O**
✅ **Keyboard driver** - PS/2 controller, scancode conversion, input buffering  
✅ **Serial output** - Logging, debugging, file output  
✅ **VGA text mode** - 80x25 display, color support  

#### **User Interface**
✅ **Interactive shell** - 11 commands, extensible architecture  
✅ **Real-time commands** - memory, process, daemon status display  
✅ **System utilities** - date, echo, uptime, test commands  

#### **Advanced Features** 🆕
✅ **Daemon system** - Background process framework  
✅ **Timer system** - 2Hz precise interrupts, real-time scheduling  
✅ **System monitoring** - Automated memory tracking, system health  
✅ **Process lifecycle** - Daemon creation, start/stop, execution tracking  

### **🏆 最終成果**
**完全に動作するMini OS**：フルスタックOS実装（カーネル、プロセス管理、割り込み処理、デバイスドライバ、インタラクティブシェル、バックグラウンドdaemonシステム）が2Hzのリアルタイムタイマーで安定動作中！

## Daemon System - 技術詳細 🆕

### **実装アーキテクチャ**
```c
typedef enum {
    DAEMON_NONE = 0,
    DAEMON_SYSTEM_MONITOR = 1,
    DAEMON_LOG_CLEANER = 2, 
    DAEMON_HEARTBEAT = 3,
    DAEMON_CUSTOM = 4
} daemon_type_t;

typedef struct {
    // ... existing process fields ...
    bool is_daemon;
    daemon_type_t daemon_type;
    u32 daemon_interval;     // ticks between executions
    u32 daemon_last_run;     // last execution tick
    bool daemon_enabled;     // running state
    u32 daemon_run_count;    // total executions
} process_t;
```

### **実行フロー**
1. **Timer Interrupt (2Hz)** → **daemon_tick()**
2. **Interval Check**: Current tick - last_run >= interval
3. **Task Execution**: daemon_execute_task() per daemon type
4. **Statistics Update**: Increment run_count, update last_run
5. **Shell Display**: 'daemon' command shows real-time status

### **監視結果例**
```
=== Daemon Status ===
| PID | Name      | Type   | Status | Interval | Runs |
| --- | --------- | ------ | ------ | -------- | ---- |
| 1   | sysmon    | SYSMON | ACTIVE | 20       | 1080 |
| 2   | heartbeat | BEAT   | ACTIVE | 10       | 2160 |
===================

SYSMON: Memory usage: 0% (44/262144 KB)
HEARTBEAT #2160: System alive (uptime: 21600 ticks)
```

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
