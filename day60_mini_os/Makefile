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
DRIVERS_C = $(wildcard $(DRIVERS_DIR)/*.c)
FS_C = $(wildcard $(FS_DIR)/*.c)

# Object files
BOOT_OBJ = $(patsubst $(BOOT_DIR)/%.asm,$(BUILD_DIR)/%.o,$(BOOT_ASM))
KERNEL_OBJ = $(patsubst $(KERNEL_DIR)/%.c,$(BUILD_DIR)/%.o,$(KERNEL_C))
DRIVERS_OBJ = $(patsubst $(DRIVERS_DIR)/%.c,$(BUILD_DIR)/%.o,$(DRIVERS_C))
FS_OBJ = $(patsubst $(FS_DIR)/%.c,$(BUILD_DIR)/%.o,$(FS_C))

ALL_OBJ = $(BOOT_OBJ) $(KERNEL_OBJ) $(DRIVERS_OBJ) $(FS_OBJ)

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

# Compile C files - drivers
$(BUILD_DIR)/%.o: $(DRIVERS_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Compile C files - fs
$(BUILD_DIR)/%.o: $(FS_DIR)/%.c
	@mkdir -p $(BUILD_DIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Create ISO (for GRUB boot)
iso: $(KERNEL_BIN)
	@mkdir -p $(BUILD_DIR)/iso/boot/grub
	cp $(KERNEL_BIN) $(BUILD_DIR)/iso/boot/
	echo 'menuentry "Mini OS" {' > $(BUILD_DIR)/iso/boot/grub/grub.cfg
	echo '    multiboot /boot/kernel.bin' >> $(BUILD_DIR)/iso/boot/grub/grub.cfg
	echo '}' >> $(BUILD_DIR)/iso/boot/grub/grub.cfg
	$(GRUB_MKRESCUE) -o $(ISO_FILE) $(BUILD_DIR)/iso

# Run in QEMU (32-bit)
run: $(KERNEL_BIN)
	qemu-system-i386 \
	    -kernel $(KERNEL_BIN) \
	    -serial file:output.log \
	    -display none \
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
	@which gcc >/dev/null || (echo "GCC not found" && exit 1)
	@which nasm >/dev/null || (echo "NASM not found. Install with: brew install nasm" && exit 1)
	@which qemu-system-i386 >/dev/null || (echo "QEMU not found. Install with: brew install qemu" && exit 1)
	@which grub-mkrescue >/dev/null || (echo "GRUB not found. Install with: brew install grub" && exit 1)
	@echo "Environment ready!"

# Help
help:
	@echo "Mini OS Build System"
	@echo ""
	@echo "Available targets:"
	@echo "  all       - Build kernel binary (default)"
	@echo "  run       - Run OS in QEMU"
	@echo "  run-iso   - Run OS from ISO in QEMU"
	@echo "  run-debug - Run OS with QEMU monitor"
	@echo "  iso       - Create bootable ISO"
	@echo "  log       - Show OS output"
	@echo "  clean     - Clean build files"
	@echo "  clean-all - Clean build files and logs"
	@echo "  setup     - Check development environment"
	@echo "  help      - Show this help"

.PHONY: all run run-iso run-debug iso clean clean-all log setup help
