# Mini OS Build Configuration
# Target: x86 architecture (32-bit)

# Directories
SRC_DIR = src
BUILD_DIR = build
BOOT_DIR = $(SRC_DIR)/boot
KERNEL_DIR = $(SRC_DIR)/kernel
DRIVERS_DIR = $(SRC_DIR)/drivers
FS_DIR = $(SRC_DIR)/fs
USER_DIR = $(SRC_DIR)/user
INCLUDE_DIR = $(SRC_DIR)/include

# Tools (macOS compatible)
CC = x86_64-elf-gcc
AS = nasm
LD = x86_64-elf-ld

# Flags for cross-compilation to x86 (32-bit)
CFLAGS = -ffreestanding \
         -fno-stack-protector \
         -fno-pic \
         -fno-pie \
         -m32 \
         -Wall \
         -Wextra \
         -I$(INCLUDE_DIR)

ASFLAGS = -f elf32

LDFLAGS = -m elf_i386 -static -nostdlib

# Source files
BOOT_ASM = $(BOOT_DIR)/multiboot_kernel.asm
KERNEL_C = $(wildcard $(KERNEL_DIR)/*.c)
KERNEL_ASM = $(wildcard $(KERNEL_DIR)/*.asm)
DRIVERS_C = $(wildcard $(DRIVERS_DIR)/*.c)
FS_C = $(wildcard $(FS_DIR)/*.c)
USER_C = $(wildcard $(USER_DIR)/*.c)

# Object files
BOOT_OBJ = $(patsubst $(BOOT_DIR)/%.asm,$(BUILD_DIR)/%.o,$(BOOT_ASM))
KERNEL_OBJ = $(patsubst $(KERNEL_DIR)/%.c,$(BUILD_DIR)/%.o,$(KERNEL_C))
KERNEL_ASM_OBJ = $(patsubst $(KERNEL_DIR)/%.asm,$(BUILD_DIR)/kernel_%.o,$(KERNEL_ASM))
DRIVERS_OBJ = $(patsubst $(DRIVERS_DIR)/%.c,$(BUILD_DIR)/%.o,$(DRIVERS_C))
FS_OBJ = $(patsubst $(FS_DIR)/%.c,$(BUILD_DIR)/%.o,$(FS_C))
USER_OBJ = $(patsubst $(USER_DIR)/%.c,$(BUILD_DIR)/user_%.o,$(USER_C))

ALL_OBJ = $(BOOT_OBJ) $(KERNEL_OBJ) $(KERNEL_ASM_OBJ) $(DRIVERS_OBJ) $(FS_OBJ) $(USER_OBJ)

# Output
KERNEL_BIN = $(BUILD_DIR)/kernel.bin
SIMPLE_BOOT = $(BUILD_DIR)/simple_boot.bin
ISO_FILE = $(BUILD_DIR)/os.iso
GRUB_MKRESCUE = /opt/homebrew/bin/grub-mkrescue

# Default target
all: $(KERNEL_BIN)

# Simple bootloader for testing
simple: $(SIMPLE_BOOT)

$(SIMPLE_BOOT): $(BOOT_DIR)/simple_boot.asm
	@mkdir -p $(BUILD_DIR)
	$(AS) -f bin $< -o $@

$(SIMPLE_BOOT): $(BOOT_DIR)/simple_boot.asm
	@mkdir -p $(BUILD_DIR)
	$(AS) -f bin $< -o $@

# Build kernel binary
$(KERNEL_BIN): $(ALL_OBJ) linker.ld
	$(LD) -m elf_i386 -T linker.ld -nostdlib -o $@ $(ALL_OBJ)

# Compile assembly files
$(BUILD_DIR)/%.o: $(BOOT_DIR)/%.asm
	@mkdir -p $(BUILD_DIR)
	$(AS) $(ASFLAGS) $< -o $@

# Compile C files - kernel
$(BUILD_DIR)/%.o: $(KERNEL_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Compile assembly files - kernel
$(BUILD_DIR)/kernel_%.o: $(KERNEL_DIR)/%.asm
	@mkdir -p $(BUILD_DIR)
	$(AS) $(ASFLAGS) $< -o $@

# Compile C files - drivers
$(BUILD_DIR)/%.o: $(DRIVERS_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Compile C files - fs
$(BUILD_DIR)/%.o: $(FS_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Compile C files - user
$(BUILD_DIR)/user_%.o: $(USER_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Create ISO (for GRUB boot) - with error handling
iso: $(KERNEL_BIN)
	@echo "Creating bootable ISO..."
	@if [ ! -f "$(GRUB_MKRESCUE)" ]; then \
		echo "Error: grub-mkrescue not found at $(GRUB_MKRESCUE)"; \
		echo "Please install GRUB:"; \
		echo "  brew install grub"; \
		echo "Or use 'make run' for direct kernel boot instead"; \
		exit 1; \
	fi
	@mkdir -p $(BUILD_DIR)/iso/boot/grub
	cp $(KERNEL_BIN) $(BUILD_DIR)/iso/boot/
	echo 'menuentry "Mini OS" {' > $(BUILD_DIR)/iso/boot/grub/grub.cfg
	echo '    multiboot /boot/kernel.bin' >> $(BUILD_DIR)/iso/boot/grub/grub.cfg
	echo '}' >> $(BUILD_DIR)/iso/boot/grub/grub.cfg
	$(GRUB_MKRESCUE) -o $(ISO_FILE) $(BUILD_DIR)/iso
	@echo "ISO created: $(ISO_FILE)"

# Run in QEMU (32-bit)
run: $(KERNEL_BIN)
	qemu-system-i386 \
	    -kernel $(KERNEL_BIN) \
	    -serial file:output.log \
	    -display none \
	    -m 256M \
	    -no-reboot \
	    -no-shutdown

# Run in QEMU with GUI (visual display)
run-gui: $(KERNEL_BIN)
	qemu-system-i386 \
	    -kernel $(KERNEL_BIN) \
	    -serial file:output.log \
	    -m 256M \
	    -no-reboot \
	    -no-shutdown

# Run in QEMU with GUI and enable cursor
run-show: $(KERNEL_BIN)
	qemu-system-i386 \
	    -kernel $(KERNEL_BIN) \
	    -serial file:output.log \
	    -m 256M \
	    -no-reboot \
	    -no-shutdown \
	    -enable-kvm 2>/dev/null || qemu-system-i386 \
	    -kernel $(KERNEL_BIN) \
	    -serial file:output.log \
	    -m 256M \
	    -no-reboot \
	    -no-shutdown

run-iso: $(ISO_FILE)
	qemu-system-i386 -cdrom $(ISO_FILE) -serial file:output.log -m 256M

# Run simple bootloader
run-simple: $(SIMPLE_BOOT)
	qemu-system-i386 \
	    -drive format=raw,file=$(SIMPLE_BOOT) \
	    -serial file:output.log \
	    -display none \
	    -m 256M

# Run simple bootloader with GUI
run-simple-gui: $(SIMPLE_BOOT)
	qemu-system-i386 \
	    -drive format=raw,file=$(SIMPLE_BOOT) \
	    -serial file:output.log \
	    -m 256M

# Run with monitor (for debugging)
run-debug: $(KERNEL_BIN)
	qemu-system-i386 \
	    -kernel $(KERNEL_BIN) \
	    -serial file:output.log \
	    -monitor stdio \
	    -m 256M \
	    -no-reboot \
	    -no-shutdown

# Clean build files
clean:
	/bin/rm -rf $(BUILD_DIR)/*

# Clean everything including logs
clean-all: clean
	/bin/rm -f output.log

# Check output
log:
	@if [ -f output.log ]; then \
		echo "=== OS Output ==="; \
		cat output.log; \
	else \
		echo "No output.log found. Run 'make run' first."; \
	fi

# Setup development environment
setup:
	@echo "Checking development environment..."
	@which gcc >/dev/null || (echo "❌ GCC not found" && exit 1)
	@echo "✅ GCC found"
	@which nasm >/dev/null || (echo "❌ NASM not found. Install with: brew install nasm" && exit 1)
	@echo "✅ NASM found"
	@which qemu-system-i386 >/dev/null || (echo "❌ QEMU not found. Install with: brew install qemu" && exit 1)
	@echo "✅ QEMU found"
	@if which grub-mkrescue >/dev/null 2>&1; then \
		echo "✅ GRUB found (ISO creation available)"; \
	else \
		echo "⚠️  GRUB not found (ISO creation disabled)"; \
		echo "   You can still use 'make run' for direct kernel boot"; \
	fi
	@echo "🎉 Environment ready for Mini OS development!"

# Quick start targets
start: $(KERNEL_BIN)
	@echo "🚀 Starting Mini OS..."
	@$(MAKE) run
	@echo "⏱️  Waiting for OS to boot..."
	@sleep 3
	@echo "📋 Showing OS output:"
	@$(MAKE) log

# Quick start with GUI
start-show: $(KERNEL_BIN)
	@echo "🚀 Starting Mini OS with GUI..."
	@$(MAKE) run-gui &
	@echo "⏱️  Waiting for OS to boot..."
	@sleep 3
	@echo "📋 Showing OS output:"
	@$(MAKE) log

quick: clean all start

# Quick start with GUI display
quick-show: clean all start-show

# Help
help:
	@echo "🏗️  Mini OS Build System"
	@echo ""
	@echo "📦 Quick Start:"
	@echo "  start       - Build and run OS, then show output"
	@echo "  start-show  - Build and run OS with GUI display"
	@echo "  quick       - Clean, build, and run (recommended)"
	@echo "  quick-show  - Clean, build, and run with GUI"
	@echo ""
	@echo "🔧 Build targets:"
	@echo "  all         - Build kernel binary (default)"
	@echo "  clean       - Clean build files"
	@echo "  setup       - Check development environment"
	@echo ""
	@echo "🚀 Run targets:"
	@echo "  run         - Run OS in QEMU (background, no display)"
	@echo "  run-gui     - Run OS in QEMU with GUI display"
	@echo "  run-show    - Run OS in QEMU with GUI (KVM optimized)"
	@echo "  run-debug   - Run OS with QEMU monitor"
	@echo "  run-iso     - Run OS from ISO in QEMU"
	@echo "  run-simple-gui - Run simple bootloader with GUI"
	@echo ""
	@echo "📊 Utility targets:"
	@echo "  log         - Show OS output"
	@echo "  clean-all   - Clean build files and logs"
	@echo "  iso         - Create bootable ISO (requires GRUB)"
	@echo "  help        - Show this help"
	@echo ""
	@echo "💡 Recommended: make quick-show (to see GUI)"

.PHONY: all run run-gui run-show run-iso run-simple-gui run-debug iso clean clean-all log setup help start start-show quick quick-show
