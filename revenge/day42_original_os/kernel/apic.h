#ifndef KERNEL_APIC_H
#define KERNEL_APIC_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include "limine.h" // For limine_smp_response
#include "paging.h" // Include for pml4e_t type

// xAPIC/x2APIC Registers (using MSRs for x2APIC if available)
#define APIC_MSR_BASE 0x800
#define APIC_MSR_ID         (APIC_MSR_BASE + 0x02) // Local APIC ID Register
#define APIC_MSR_VERSION    (APIC_MSR_BASE + 0x03) // Local APIC Version Register
#define APIC_MSR_TPR        (APIC_MSR_BASE + 0x08) // Task Priority Register (TPR)
#define APIC_MSR_APR        (APIC_MSR_BASE + 0x09) // Arbitration Priority Register (APR)
#define APIC_MSR_PPR        (APIC_MSR_BASE + 0x0A) // Processor Priority Register (PPR)
#define APIC_MSR_EOI        (APIC_MSR_BASE + 0x0B) // EOI Register
#define APIC_MSR_RRD        (APIC_MSR_BASE + 0x0C) // Remote Read Register
#define APIC_MSR_LDR        (APIC_MSR_BASE + 0x0D) // Logical Destination Register
#define APIC_MSR_DFR        (APIC_MSR_BASE + 0x0E) // Destination Format Register
#define APIC_MSR_SVR        (APIC_MSR_BASE + 0x0F) // Spurious Interrupt Vector Register (SVR)
#define APIC_MSR_ISR_BASE   (APIC_MSR_BASE + 0x10) // In-Service Register (ISR) (8 MSRs)
#define APIC_MSR_TMR_BASE   (APIC_MSR_BASE + 0x18) // Trigger Mode Register (TMR) (8 MSRs)
#define APIC_MSR_IRR_BASE   (APIC_MSR_BASE + 0x20) // Interrupt Request Register (IRR) (8 MSRs)
#define APIC_MSR_ESR        (APIC_MSR_BASE + 0x28) // Error Status Register (ESR)
#define APIC_MSR_ICR        (APIC_MSR_BASE + 0x30) // Interrupt Command Register (ICR) (low 32 bits)
#define APIC_MSR_ICR_HIGH   (APIC_MSR_BASE + 0x31) // Interrupt Command Register (ICR) (high 32 bits)
#define APIC_MSR_LVT_TIMER  (APIC_MSR_BASE + 0x32) // LVT Timer Register
#define APIC_MSR_LVT_THERMAL (APIC_MSR_BASE + 0x33) // LVT Thermal Sensor Register
#define APIC_MSR_LVT_PERF   (APIC_MSR_BASE + 0x34) // LVT Performance Monitoring Counters Register
#define APIC_MSR_LVT_LINT0  (APIC_MSR_BASE + 0x35) // LVT LINT0 Register
#define APIC_MSR_LVT_LINT1  (APIC_MSR_BASE + 0x36) // LVT LINT1 Register
#define APIC_MSR_LVT_ERROR  (APIC_MSR_BASE + 0x37) // LVT Error Register
#define APIC_MSR_TIMER_ICR  (APIC_MSR_BASE + 0x38) // Initial Count Register (for Timer)
#define APIC_MSR_TIMER_CCR  (APIC_MSR_BASE + 0x39) // Current Count Register (for Timer)
#define APIC_MSR_TIMER_DCR  (APIC_MSR_BASE + 0x3E) // Divide Configuration Register (for Timer)
#define APIC_MSR_SELF_IPI   (APIC_MSR_BASE + 0x3F) // Self IPI Register (Write Only)

// Spurious Interrupt Vector Register (SVR) bits
#define SVR_VECTOR_MASK  0xFF       // Bits 0-7: Spurious Vector
#define SVR_APIC_ENABLE (1 << 8)    // Bit 8: APIC Software Enable/Disable
#define SVR_FOCUS_DISABLE (1 << 9)  // Bit 9: Focus Processor Checking Disable
#define SVR_EOI_BROADCAST_SUPPRESS (1 << 12) // Bit 12: EOI-Broadcast Suppression

// LVT Timer Register bits
#define LVT_TIMER_VECTOR_MASK   0xFF       // Bits 0-7: Timer Interrupt Vector
#define LVT_TIMER_DELIVERY_STATUS (1 << 12) // Bit 12: Delivery Status (Read Only)
#define LVT_TIMER_MASKED        (1 << 16)  // Bit 16: Interrupt Mask (1=masked)
#define LVT_TIMER_MODE_ONESHOT  (0b00 << 17) // Bits 17-18: Timer Mode - One-shot
#define LVT_TIMER_MODE_PERIODIC (0b01 << 17) // Bits 17-18: Timer Mode - Periodic
#define LVT_TIMER_MODE_TSC_DEADLINE (0b10 << 17) // Bits 17-18: Timer Mode - TSC-Deadline

// Timer Divide Configuration Register (TDCR) bits
// Bottom 4 bits define the divisor:
// 0000: /2     1000: /1
// 0001: /4     1001: /16
// 0010: /8     1010: /32
// 0011: /16    1011: /64
// 1000: /128   1111: /128 (same as 1000) - correction: 1011 should be /128
// Correct encoding: 0=2, 1=4, 2=8, 3=16, 8=32, 9=64, 10=128, 11=1
#define TIMER_DIVIDE_BY_1   0b1011
#define TIMER_DIVIDE_BY_2   0b0000
#define TIMER_DIVIDE_BY_4   0b0001
#define TIMER_DIVIDE_BY_8   0b0010
#define TIMER_DIVIDE_BY_16  0b0011
#define TIMER_DIVIDE_BY_32  0b1000
#define TIMER_DIVIDE_BY_64  0b1001
#define TIMER_DIVIDE_BY_128 0b1010


// Interrupt Command Register (ICR) bits (Low 32 bits)
#define ICR_VECTOR_MASK      0xFF       // Bits 0-7: Vector
#define ICR_DELIVERY_MODE_FIXED     (0b000 << 8)
#define ICR_DELIVERY_MODE_LOWPRI    (0b001 << 8)
#define ICR_DELIVERY_MODE_SMI       (0b010 << 8)
#define ICR_DELIVERY_MODE_NMI       (0b100 << 8)
#define ICR_DELIVERY_MODE_INIT      (0b101 << 8)
#define ICR_DELIVERY_MODE_STARTUP   (0b110 << 8)
#define ICR_DESTINATION_MODE_PHYSICAL (0 << 11) // 0: Physical, 1: Logical
#define ICR_DESTINATION_MODE_LOGICAL  (1 << 11)
#define ICR_DELIVERY_STATUS_IDLE    (0 << 12) // Read Only
#define ICR_DELIVERY_STATUS_PENDING (1 << 12) // Read Only
#define ICR_LEVEL_DEASSERT          (0 << 14)
#define ICR_LEVEL_ASSERT            (1 << 14)
#define ICR_TRIGGER_MODE_EDGE       (0 << 15)
#define ICR_TRIGGER_MODE_LEVEL      (1 << 15)
#define ICR_DESTINATION_SHORTHAND_NONE      (0b00 << 18)
#define ICR_DESTINATION_SHORTHAND_SELF      (0b01 << 18)
#define ICR_DESTINATION_SHORTHAND_ALL_INCL  (0b10 << 18)
#define ICR_DESTINATION_SHORTHAND_ALL_EXCL  (0b11 << 18)

// EOI value to write
#define APIC_EOI_ACK 0x00


extern volatile uint64_t tick_counter; // Global tick counter
extern bool x2apic_enabled;
extern uintptr_t apic_virt_base; // Virtual base address for MMIO (if xAPIC)

// Function prototypes
void init_apic(struct limine_smp_response *smp_info);
void lapic_timer_set(uint32_t vector, uint64_t initial_count, uint32_t divide_value, uint64_t mode);
void lapic_send_eoi(void);

// MSR helper functions (defined static inline in msr.h)
// uint64_t rdmsr(uint32_t msr); // Remove extern declaration
// void wrmsr(uint32_t msr, uint64_t value); // Remove extern declaration

#define IA32_APIC_BASE_MSR 0x1B
#define IA32_APIC_BASE_MSR_BSP            (1 << 8)  // Processor is BSP
#define IA32_APIC_BASE_MSR_X2APIC_ENABLE  (1 << 10) // x2APIC mode enable
#define IA32_APIC_BASE_MSR_ENABLE         (1 << 11) // APIC global enable/disable

// xAPIC Register Offsets (from Local APIC MMIO base)
#define XAPIC_REG_ID        0x0020  // Local APIC ID Register
#define XAPIC_REG_VERSION   0x0030  // Local APIC Version Register
#define XAPIC_REG_TPR       0x0080  // Task Priority Register (TPR)
#define XAPIC_REG_APR       0x0090  // Arbitration Priority Register (APR)
#define XAPIC_REG_PPR       0x00A0  // Processor Priority Register (PPR)
#define XAPIC_REG_EOI       0x00B0  // EOI Register (Write-Only)
#define XAPIC_REG_LDR       0x00D0  // Logical Destination Register
#define XAPIC_REG_DFR       0x00E0  // Destination Format Register
#define XAPIC_REG_SVR       0x00F0  // Spurious Interrupt Vector Register (SVR)
#define XAPIC_REG_ESR       0x0280  // Error Status Register (ESR)
#define XAPIC_REG_ICR_LOW   0x0300  // Interrupt Command Register (ICR) [31:0]
#define XAPIC_REG_ICR_HIGH  0x0310  // Interrupt Command Register (ICR) [63:32]
#define XAPIC_REG_LVT_TIMER 0x0320  // LVT Timer Register
#define XAPIC_REG_LVT_THERMAL 0x0330 // LVT Thermal Sensor Register
#define XAPIC_REG_LVT_PERF  0x0340  // LVT Performance Monitoring Counters Register
#define XAPIC_REG_LVT_LINT0 0x0350  // LVT LINT0 Register
#define XAPIC_REG_LVT_LINT1 0x0360  // LVT LINT1 Register
#define XAPIC_REG_LVT_ERROR 0x0370  // LVT Error Register
#define XAPIC_REG_TIMER_ICR 0x0380  // Initial Count Register (for Timer)
#define XAPIC_REG_TIMER_CCR 0x0390  // Current Count Register (for Timer) (Read-Only)
#define XAPIC_REG_TIMER_DCR 0x03E0  // Divide Configuration Register (for Timer)

// x2APIC MSRs (from Intel SDM Vol 3A, Table 10-1)
// ... existing code ...

#endif // KERNEL_APIC_H
