#include "apic.h"
#include "main.h" // For print_serial etc.
#include "serial.h"
#include "paging.h" // For map_page and PTE flags
#include "pmm.h"    // For PAGE_SIZE (redundant if paging.h included)
#include "msr.h"
#include <stdbool.h>
#include "task.h" // For current_task and task_t

// Global state
volatile uint64_t tick_counter = 0;
bool x2apic_enabled = false;
uintptr_t apic_virt_base = 0; // For MMIO

// MMIO access functions (for xAPIC)
static inline void lapic_mmio_write(uint32_t reg_offset, uint32_t value) {
    if (apic_virt_base == 0) return; // Should not happen if initialized correctly
    *((volatile uint32_t *)(apic_virt_base + reg_offset)) = value;
}

static inline uint32_t lapic_mmio_read(uint32_t reg_offset) {
    if (apic_virt_base == 0) return 0;
    return *((volatile uint32_t *)(apic_virt_base + reg_offset));
}

// MSR helper functions are now included from msr.h
/*
inline uint64_t rdmsr(uint32_t msr) {
    uint32_t low, high;
    asm volatile (
        "rdmsr"
        : "=a"(low), "=d"(high)
        : "c"(msr)
    );
    return ((uint64_t)high << 32) | low;
}

inline void wrmsr(uint32_t msr, uint64_t value) {
    uint32_t low = value & 0xFFFFFFFF;
    uint32_t high = value >> 32;
    asm volatile (
        "wrmsr"
        : // no outputs
        : "c"(msr), "a"(low), "d"(high)
        : "memory" // Add memory clobber to prevent reordering
    );
}
*/

// Called by the common IRQ handler
void timer_handler(struct registers *regs) {
    tick_counter++;

    // Save current task's context
    if (current_task != NULL) {
        current_task->context = *regs; // Copy the register state
    }

    schedule(); // CALL schedule() HERE

    lapic_send_eoi();
}

void init_apic(struct limine_smp_response *smp_info) {
    if (smp_info == NULL || smp_info->cpu_count == 0) {
        print_serial(SERIAL_COM1_BASE, "Error: SMP info not available\n");
        return;
    }

    uint64_t apic_base_msr = rdmsr(IA32_APIC_BASE_MSR);
    uint64_t apic_phys_base = apic_base_msr & 0xFFFFF000; // Get physical base address (mask flags)

    if (apic_base_msr & IA32_APIC_BASE_MSR_X2APIC_ENABLE) {
        print_serial(SERIAL_COM1_BASE, "x2APIC mode detected via IA32_APIC_BASE.X2APIC_ENABLE bit.\n");
        x2apic_enabled = true;
        apic_virt_base = 0; // Not used in x2APIC mode
        // Ensure APIC Global Enable bit (Bit 11) is set in MSR.
        // We don't need to rewrite the whole MSR if only checking enable bit.
        if (!(apic_base_msr & IA32_APIC_BASE_MSR_ENABLE)) {
            print_serial(SERIAL_COM1_BASE, "Warning: IA32_APIC_BASE MSR reports APIC disabled (Globally). Attempting to enable.\n");
            wrmsr(IA32_APIC_BASE_MSR, apic_base_msr | IA32_APIC_BASE_MSR_ENABLE);
            apic_base_msr = rdmsr(IA32_APIC_BASE_MSR); // Re-read after enabling
            if (!(apic_base_msr & IA32_APIC_BASE_MSR_ENABLE)) {
                panic("Failed to globally enable APIC via MSR!");
            }
        }
    } else {
        print_serial(SERIAL_COM1_BASE, "xAPIC mode detected (x2APIC disabled in IA32_APIC_BASE MSR).\n");
        x2apic_enabled = false;

        // APIC MMIO page mapping is now done in init_paging
        // We just need to calculate the expected virtual address based on HHDM
        if (apic_phys_base == 0) {
            panic("APIC physical base address is zero!");
        }
        apic_virt_base = apic_phys_base + hhdm_offset; // Set expected virtual base
        print_serial_str_hex(SERIAL_COM1_BASE, "xAPIC using expected Virt Addr: ", apic_virt_base);
        print_serial(SERIAL_COM1_BASE, " (Mapping done in init_paging)\n");

        // Ensure APIC Global Enable bit (Bit 11) is set in MSR.
        if (!(apic_base_msr & IA32_APIC_BASE_MSR_ENABLE)) {
            print_serial(SERIAL_COM1_BASE, "Warning: IA32_APIC_BASE MSR reports APIC disabled (Globally). Attempting to enable.\n");
            wrmsr(IA32_APIC_BASE_MSR, apic_base_msr | IA32_APIC_BASE_MSR_ENABLE);
             apic_base_msr = rdmsr(IA32_APIC_BASE_MSR); // Re-read after enabling
            if (!(apic_base_msr & IA32_APIC_BASE_MSR_ENABLE)) {
                panic("Failed to globally enable APIC via MSR!");
            }
        }
    }

    // Get BSP's LAPIC ID
    uint32_t bsp_lapic_id_from_limine = smp_info->bsp_lapic_id;
    uint32_t current_lapic_id = 0;
    if (x2apic_enabled) {
        current_lapic_id = (uint32_t)rdmsr(APIC_MSR_ID);
    } else {
        current_lapic_id = lapic_mmio_read(XAPIC_REG_ID);
    }
    print_serial_str_int(SERIAL_COM1_BASE, "BSP LAPIC ID (Limine): ", bsp_lapic_id_from_limine);
    print_serial_str_int(SERIAL_COM1_BASE, "Current LAPIC ID: ", current_lapic_id);

    // Read LAPIC Version
    uint32_t version_reg = 0;
    if (x2apic_enabled) {
        version_reg = (uint32_t)rdmsr(APIC_MSR_VERSION);
    } else {
        version_reg = lapic_mmio_read(XAPIC_REG_VERSION);
    }
    print_serial_str_hex(SERIAL_COM1_BASE, "LAPIC Version Register: ", version_reg);

    // Enable the LAPIC by setting the Spurious Interrupt Vector Register (SVR)
    uint32_t svr_value = 0;
    uint32_t spurious_vector = 0xFF;
    uint32_t svr_enable_flag = SVR_APIC_ENABLE;

    if (x2apic_enabled) {
        svr_value = (uint32_t)rdmsr(APIC_MSR_SVR);
        svr_value |= svr_enable_flag; // Enable APIC bit
        svr_value = (svr_value & ~SVR_VECTOR_MASK) | spurious_vector; // Set spurious vector
        wrmsr(APIC_MSR_SVR, svr_value);
    } else {
        svr_value = lapic_mmio_read(XAPIC_REG_SVR);
        svr_value |= svr_enable_flag; // Enable APIC bit
        svr_value = (svr_value & ~SVR_VECTOR_MASK) | spurious_vector; // Set spurious vector
        lapic_mmio_write(XAPIC_REG_SVR, svr_value);
    }
    print_serial_str_hex(SERIAL_COM1_BASE, "SVR after enabling: ", svr_value);

    // Configure the LAPIC timer
    #define TIMER_IRQ_VECTOR 32
    #define TIMER_FREQUENCY_HZ 100
    uint64_t initial_count = 10000000; // Adjust as needed
    uint32_t divide_value = TIMER_DIVIDE_BY_16; // Use xAPIC definition if different

    lapic_timer_set(TIMER_IRQ_VECTOR, initial_count, divide_value, LVT_TIMER_MODE_PERIODIC);
    print_serial_str_int(SERIAL_COM1_BASE, "LAPIC Timer configured for vector ", TIMER_IRQ_VECTOR);
    print_serial_str_int(SERIAL_COM1_BASE, " with initial count ", (uint32_t)initial_count);
    print_serial_str_int(SERIAL_COM1_BASE, " and divide value index ", divide_value);

    print_serial(SERIAL_COM1_BASE, "LAPIC initialized successfully.\n");
}

void lapic_timer_set(uint32_t vector, uint64_t initial_count, uint32_t divide_config_index, uint64_t mode) {
    uint32_t initial_count32 = (uint32_t)initial_count; // APIC timer counts are 32-bit

    if (x2apic_enabled) {
        wrmsr(APIC_MSR_TIMER_DCR, divide_config_index);
        uint64_t lvt_timer_value = (vector & LVT_TIMER_VECTOR_MASK) | mode | LVT_TIMER_MASKED; // Start masked
        wrmsr(APIC_MSR_LVT_TIMER, lvt_timer_value);
        wrmsr(APIC_MSR_TIMER_ICR, initial_count32);
        lvt_timer_value &= ~LVT_TIMER_MASKED; // Unmask
        wrmsr(APIC_MSR_LVT_TIMER, lvt_timer_value);
    } else {
        lapic_mmio_write(XAPIC_REG_TIMER_DCR, divide_config_index);
        uint32_t lvt_timer_value = (vector & LVT_TIMER_VECTOR_MASK) | (uint32_t)mode | LVT_TIMER_MASKED; // Start masked
        lapic_mmio_write(XAPIC_REG_LVT_TIMER, lvt_timer_value);
        lapic_mmio_write(XAPIC_REG_TIMER_ICR, initial_count32);
        lvt_timer_value &= ~LVT_TIMER_MASKED; // Unmask
        lapic_mmio_write(XAPIC_REG_LVT_TIMER, lvt_timer_value);
    }
}

void lapic_send_eoi() {
    if (x2apic_enabled) {
        wrmsr(APIC_MSR_EOI, APIC_EOI_ACK);
    } else {
        lapic_mmio_write(XAPIC_REG_EOI, APIC_EOI_ACK); // Write any value (0 is fine)
    }
}
