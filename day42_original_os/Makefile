# Makefile for Day42 Original OS with Limine

# --- Toolchain --- (Adjust to your environment)
CC_KERNEL  := clang
LD_KERNEL  := clang # Use clang as the linker driver
OBJCOPY    := /opt/homebrew/opt/llvm/bin/llvm-objcopy # Full path to llvm-objcopy

# --- Target --- (x86_64)
TARGET_ARCH := x86_64
TARGET_KERNEL := $(TARGET_ARCH)-elf

# --- Directories ---
SRC_DIR_KERNEL := kernel
BUILD_DIR      := build
IMAGE_DIR      := image
SCRIPTS_DIR    := scripts
LIMINE_DIR     := limine
LIMINE_BIOS_CD_BIN := $(LIMINE_DIR)/limine-bios-cd.bin
LIMINE_UEFI_CD_BIN := $(LIMINE_DIR)/limine-uefi-cd.bin

# --- Kernel ---
KERNEL_SRC     := $(SRC_DIR_KERNEL)/main.c
KERNEL_LIMINE_H:= $(SRC_DIR_KERNEL)/limine.h
KERNEL_OBJ     := $(BUILD_DIR)/kernel.o
KERNEL_ELF     := $(BUILD_DIR)/kernel.elf
LINKER_SCRIPT  := $(SCRIPTS_DIR)/linker.ld

CFLAGS_KERNEL  := -target $(TARGET_KERNEL) -ffreestanding -nostdlib -Wall -Wextra -g -I$(SRC_DIR_KERNEL) -mno-red-zone
LDFLAGS_KERNEL := -T $(LINKER_SCRIPT) --target=$(TARGET_KERNEL) -fuse-ld=lld -nostdlib -static -pie -z max-page-size=0x1000

# --- Image --- (Limine setup)
OS_ISO := $(IMAGE_DIR)/os.iso
ESP_SOURCE_DIR  := $(BUILD_DIR)/esp_source

# Limine files
LIMINE_BOOTLOADER_UEFI_EFI := $(LIMINE_DIR)/BOOTX64.EFI
LIMINE_BOOTLOADER_BIOS_SYS := $(LIMINE_DIR)/limine-bios.sys
LIMINE_CFG_SRC             := $(IMAGE_DIR)/limine.conf
LIMINE_DEPLOY_TOOL         := $(LIMINE_DIR)/limine

# QEMU options
# -no-reboot: Exit QEMU instead of rebooting on triple fault
# -no-shutdown: Keep QEMU window open after guest shutdown (useful for seeing final messages)
# -d int: Log interrupts to qemu.log (useful for debugging IRQs/exceptions)
# -D qemu_debug.log: Log other QEMU debug info
# -monitor stdio: Allow QEMU monitor commands on the console
# -serial stdio: Redirect COM1 to stdio
OVMF_CODE := image/OVMF_CODE.fd
OVMF_VARS := image/OVMF_VARS.fd
QEMU := qemu-system-x86_64
QEMU_OPTS_COMMON := -no-reboot -no-shutdown -d int -D qemu_debug.log
QEMU_OPTS_BIOS := -machine pc -m 256M -serial stdio
QEMU_OPTS_UEFI := -machine q35 -cpu qemu64 -m 256M -drive if=pflash,format=raw,readonly=on,file=$(OVMF_CODE) -drive if=pflash,format=raw,file=$(OVMF_VARS) -serial stdio

all: $(OS_ISO)

$(LIMINE_DEPLOY_TOOL):
	@echo "Building limine-deploy tool..."
	$(MAKE) -C $(LIMINE_DIR)

$(KERNEL_ELF): $(KERNEL_SRC) $(KERNEL_LIMINE_H) $(LINKER_SCRIPT)
	@mkdir -p $(BUILD_DIR)
	$(CC_KERNEL) $(CFLAGS_KERNEL) -c $(KERNEL_SRC) -o $(KERNEL_OBJ)
	$(LD_KERNEL) $(LDFLAGS_KERNEL) $(KERNEL_OBJ) -o $@

$(OS_ISO): $(KERNEL_ELF) $(LIMINE_CFG_SRC) $(LIMINE_BIOS_CD_BIN) $(LIMINE_UEFI_CD_BIN) $(LIMINE_BOOTLOADER_BIOS_SYS) $(LIMINE_BOOTLOADER_UEFI_EFI) $(LIMINE_DEPLOY_TOOL)
	@echo "Cleaning up old ISO and staging directory..."
	@rm -rf $(OS_ISO) $(ESP_SOURCE_DIR)
	@mkdir -p $(IMAGE_DIR)
	@mkdir -p $(ESP_SOURCE_DIR)/boot/limine
	@mkdir -p $(ESP_SOURCE_DIR)/EFI/BOOT

	@echo "Staging files to $(ESP_SOURCE_DIR)..."
	cp $(LIMINE_BIOS_CD_BIN) $(ESP_SOURCE_DIR)/boot/limine/limine-bios-cd.bin
	cp $(LIMINE_BOOTLOADER_BIOS_SYS) $(ESP_SOURCE_DIR)/boot/limine/limine-bios.sys
	cp $(LIMINE_UEFI_CD_BIN) $(ESP_SOURCE_DIR)/boot/limine/limine-uefi-cd.bin
	cp $(LIMINE_BOOTLOADER_UEFI_EFI) $(ESP_SOURCE_DIR)/EFI/BOOT/BOOTX64.EFI
	cp $(KERNEL_ELF) $(ESP_SOURCE_DIR)/boot/kernel.elf
	cp $(LIMINE_CFG_SRC) $(ESP_SOURCE_DIR)/boot/limine/limine.conf

	@echo "Creating bootable ISO image $(OS_ISO) with xorriso..."
	xorriso -as mkisofs \
	    -iso-level 3 \
	    -V "MYOS" \
	    -R -J \
	    -b boot/limine/limine-bios-cd.bin \
	    -no-emul-boot -boot-load-size 4 -boot-info-table \
	    -eltorito-alt-boot \
	    -e boot/limine/limine-uefi-cd.bin \
	    -no-emul-boot \
	    -o $(OS_ISO) \
	    $(ESP_SOURCE_DIR)

	@echo "Installing Limine BIOS bootloader to ISO..."
	$(LIMINE_DEPLOY_TOOL) bios-install $(OS_ISO)

	@echo "OS ISO with Limine created: $(OS_ISO)"

# Default run target
run: run-bios

run-bios:
	$(QEMU) $(QEMU_OPTS_COMMON) $(QEMU_OPTS_BIOS) -cdrom $(OS_ISO)

run-uefi:
	$(QEMU) $(QEMU_OPTS_COMMON) $(QEMU_OPTS_UEFI) -cdrom $(OS_ISO)

clean:
	rm -rf $(BUILD_DIR) $(OS_ISO) $(ESP_SOURCE_DIR) $(IMAGE_DIR)/*.cdr

.PHONY: all clean run run-bios run-uefi
