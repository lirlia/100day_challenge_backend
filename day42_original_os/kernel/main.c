#include "limine.h"
#include "main.h"
#include "serial.h"
#include "io.h"
#include "gdt.h"
#include "paging.h"
#include "pmm.h"
#include "idt.h"
#include "apic.h"
#include "font.h"
#include "task.h"
#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

// --- Limine Requests --- (Keep as static volatile)
static volatile struct limine_framebuffer_request framebuffer_request = { .id = LIMINE_FRAMEBUFFER_REQUEST, .revision = 0 };
volatile struct limine_memmap_request memmap_request = { .id = LIMINE_MEMMAP_REQUEST, .revision = 0 };
volatile struct limine_hhdm_request hhdm_request = { .id = LIMINE_HHDM_REQUEST, .revision = 0 };
volatile struct limine_kernel_address_request kernel_addr_request = { .id = LIMINE_KERNEL_ADDRESS_REQUEST, .revision = 0 };
volatile struct limine_smp_request smp_request = { .id = LIMINE_SMP_REQUEST, .revision = 0 };

// --- Global variables (Defined here, declared extern in main.h) ---
struct limine_framebuffer *framebuffer = NULL;
uint64_t hhdm_offset = 0;

// Drawing state (Non-static, definitions match extern in main.h)
int cursor_x = 0;
int cursor_y = 0;
int FONT_SCALE = 1;
uint32_t text_color = 0xFFFFFF;
uint32_t bg_color = 0x000000;

// Define KERNEL_STACK_PAGES once at the top level
#define KERNEL_STACK_PAGES 16

extern uint64_t kernel_stack_top_phys; // Re-add TSS related extern

// Global pointer to the current framebuffer, initialized in _start, used by drawing functions
// This needs to be updated if the framebuffer address is virtualized after paging.
static struct limine_framebuffer *current_framebuffer = NULL;

// Kernel entry point
void _start(void) {
    // struct kernel_addr kernel_addresses; // Local struct is fine // <- REMOVE THIS LINE

    // Honor Limine requests (accessing static volatiles is okay)
    if (framebuffer_request.response == NULL || framebuffer_request.response->framebuffer_count < 1) { hcf(); }
    framebuffer = framebuffer_request.response->framebuffers[0];
    if (memmap_request.response == NULL) { hcf(); }
    if (hhdm_request.response == NULL) { hcf(); }
    hhdm_offset = hhdm_request.response->offset;
    if (kernel_addr_request.response == NULL) { hcf(); }
    // kernel_addresses.physical_base = kernel_addr_request.response->physical_base; // <- REMOVE THIS LINE
    // kernel_addresses.virtual_base = kernel_addr_request.response->virtual_base;   // <- REMOVE THIS LINE
    if (smp_request.response == NULL) { hcf(); }

    // Initialize serial
    if (init_serial(SERIAL_COM1_BASE) != 0) { /* Handle error? */ }
    print_serial(SERIAL_COM1_BASE, "Serial port initialized.\n");

    // Print Limine info (using helpers that call correct print_serial)
    print_serial_str_hex(SERIAL_COM1_BASE, "HHDM Offset: ", hhdm_offset);
    // ... other print calls ...
    print_serial_str_int(SERIAL_COM1_BASE, "SMP CPU Count: ", smp_request.response->cpu_count);
    // ... other print calls ...

    // Initialize GDT, IDT, PMM
    init_gdt();
    init_idt();
    init_pmm(memmap_request.response);
    print_serial(SERIAL_COM1_BASE, "PMM Initialized. Free pages: ");
    print_serial_dec(SERIAL_COM1_BASE, pmm_get_free_page_count());
    print_serial(SERIAL_COM1_BASE, "\n");

    // --- Allocate Kernel Stack ---
    uint64_t stack_phys_bottom = 0;
    uint64_t stack_size = KERNEL_STACK_PAGES * PAGE_SIZE;
    print_serial_str_int(SERIAL_COM1_BASE, "Allocating kernel stack (pages): ", KERNEL_STACK_PAGES);
    stack_phys_bottom = (uint64_t)pmm_alloc_page();
    if (stack_phys_bottom == 0) { panic("Failed to allocate page for kernel stack!"); }
    print_serial_str_hex(SERIAL_COM1_BASE, "Kernel stack allocated. Bottom Phys Addr: ", stack_phys_bottom);
    uint64_t new_rsp_virt_top = (stack_phys_bottom + stack_size - 8) + hhdm_offset;
    print_serial_str_hex(SERIAL_COM1_BASE, "Calculated initial RSP (virtual top): ", new_rsp_virt_top);
    struct limine_framebuffer *fb_for_kernel_main = framebuffer;

    print_serial(SERIAL_COM1_BASE, "Calling init_paging...\n");

    // Call init_paging with correct arguments
    init_paging(
        framebuffer_request.response,
        memmap_request.response,
        stack_phys_bottom,
        stack_size,
        new_rsp_virt_top,
        kernel_main_after_paging, // Function pointer
        fb_for_kernel_main
    );
    hcf(); // Should not return
}

// --- Dummy Task Functions ---
void dummy_task_a_main(void) {
    uint64_t counter = 0;
    while (1) {
        if ((counter % 500000) == 0) { // Adjust frequency as needed
            print_serial(SERIAL_COM1_BASE, "A");
        }
        counter++;
        // Small delay to prevent spamming and allow observation
        for (volatile int i = 0; i < 1000; ++i) { asm volatile ("nop"); }
        // asm volatile ("hlt"); // Using hlt might stop the task if interrupts are not yet fully handled by scheduler for tasks
    }
}

void dummy_task_b_main(void) {
    uint64_t counter = 0;
    while (1) {
        if ((counter % 500000) == 0) { // Adjust frequency as needed
            print_serial(SERIAL_COM1_BASE, "B");
        }
        counter++;
        // Small delay to prevent spamming and allow observation
        for (volatile int i = 0; i < 1000; ++i) { asm volatile ("nop"); }
        // asm volatile ("hlt");
    }
}

// This is the correct definition called after paging
void kernel_main_after_paging(struct limine_framebuffer *fb_info, uint64_t new_rsp) {
    (void)new_rsp; // new_rsp is now the current stack pointer, may not be directly used further

    current_framebuffer = fb_info;
    if (current_framebuffer && (uint64_t)current_framebuffer->address < hhdm_offset) { // Cast to uint64_t for comparison
        current_framebuffer->address = (void *)((uint64_t)current_framebuffer->address + hhdm_offset);
    }

    clear_screen_with_color(COLOR_DARK_SLATE_GRAY);
    set_text_color(COLOR_LIGHT_CYAN);
    set_bg_color(COLOR_DARK_SLATE_GRAY);
    cursor_x = 0;
    cursor_y = 0;

    print_serial(SERIAL_COM1_BASE, "\n--- Kernel main after paging and stack switch ---\n"); // Use print_serial with port
    print_serial_str_hex(SERIAL_COM1_BASE, "New RSP (virtual top of new kernel stack): ", get_rsp());
    print_serial_str_hex(SERIAL_COM1_BASE, "Framebuffer virtual address: ", (uint64_t)current_framebuffer->address);
    print_serial_str_hex(SERIAL_COM1_BASE, "PML4 virtual address: ", (uint64_t)kernel_pml4_virt);
    print_serial_str_hex(SERIAL_COM1_BASE, "PML4 physical address: ", (uint64_t)kernel_pml4_phys); // Cast to uint64_t

    put_string_at("Hello, kernel from Higher Half!", 1, 1, COLOR_WHITE, COLOR_BLACK);
    put_string_at_serial("Hello, kernel from Higher Half! (Serial)\n");

    // Reset colors for subsequent general prints if needed
    text_color = COLOR_LIGHT_CYAN;
    bg_color = COLOR_DARK_SLATE_GRAY;

    tss_set_rsp0(KERNEL_STACK_VIRT_TOP);
    print_serial_str_hex(SERIAL_COM1_BASE, "TSS.RSP0 set to: ", KERNEL_STACK_VIRT_TOP);

    init_idt();
    print_serial(SERIAL_COM1_BASE, "IDT initialized and loaded (after paging).\n");

    init_apic(smp_request.response);
    print_serial(SERIAL_COM1_BASE, "APIC initialized (after paging).\n");

    init_task_queue(&ready_queue);
    print_serial(SERIAL_COM1_BASE, "Task ready queue initialized.\n");

    print_serial(SERIAL_COM1_BASE, "\n--- Testing PMM Stack Page Mapping ---\n");
    print_serial_str_hex(SERIAL_COM1_BASE, "PMM stack physical base: 0x", pmm_info.stack_phys_base);
    print_serial_str_hex(SERIAL_COM1_BASE, "PMM stack HHDM virtual base: 0x", (uint64_t)pmm_info.stack_base);

    uint64_t pmm_stack_test_phys_addr = pmm_info.stack_phys_base;
    volatile uint64_t *pmm_stack_test_virt_ptr = (uint64_t *)(hhdm_offset + pmm_stack_test_phys_addr);

    print_serial(SERIAL_COM1_BASE, "Attempting to access PMM stack's first page via HHDM.\n");
    print_serial(SERIAL_COM1_BASE, "  Physical Address to test: 0x");
    print_serial_hex(SERIAL_COM1_BASE, pmm_stack_test_phys_addr); // Using print_serial_hex
    write_serial_char(SERIAL_COM1_BASE, '\n'); // Replaced serial_putc_direct
    print_serial(SERIAL_COM1_BASE, "  Virtual Address (HHDM): 0x");
    print_serial_hex(SERIAL_COM1_BASE, (uint64_t)pmm_stack_test_virt_ptr); // Using print_serial_hex
    write_serial_char(SERIAL_COM1_BASE, '\n'); // Replaced serial_putc_direct

    uint64_t original_value_at_stack_base;
    int test_success = 0;

    asm volatile ("cli");
    original_value_at_stack_base = *pmm_stack_test_virt_ptr;
    print_serial_str_hex(SERIAL_COM1_BASE, "  Read original value: 0x", original_value_at_stack_base);
    *pmm_stack_test_virt_ptr = 0x12345678ABCDDCBA;
    print_serial(SERIAL_COM1_BASE, "  Wrote 0x12345678ABCDDCBA\n");
    if (*pmm_stack_test_virt_ptr == 0x12345678ABCDDCBA) {
        print_serial(SERIAL_COM1_BASE, "  SUCCESS: Read back matches written value.\n");
        test_success = 1;
    } else {
        print_serial(SERIAL_COM1_BASE, "  FAILURE: Read back mismatch! Read: 0x");
        print_serial_hex(SERIAL_COM1_BASE, *pmm_stack_test_virt_ptr); // Using print_serial_hex
        write_serial_char(SERIAL_COM1_BASE, '\n'); // Replaced serial_putc_direct
    }
    *pmm_stack_test_virt_ptr = original_value_at_stack_base;
    print_serial(SERIAL_COM1_BASE, "  Restored original value.\n");
    asm volatile ("sti");

    if(test_success) {
        print_serial(SERIAL_COM1_BASE, "PMM stack page is correctly mapped in HHDM and is R/W.\n");
    } else {
        print_serial(SERIAL_COM1_BASE, "ERROR: PMM stack page mapping or R/W test FAILED.\n");
    }
    print_serial(SERIAL_COM1_BASE, "--- PMM Stack Page Mapping Test Complete ---\n\n");

    print_serial(SERIAL_COM1_BASE, "\n--- Creating and Enqueueing Dummy Tasks ---\n");

    print_serial(SERIAL_COM1_BASE, "Attempting to create TaskA...\n");
    task_t *task_a = create_task("TaskA", dummy_task_a_main, (uint64_t)kernel_pml4_phys);
    if (task_a) {
        print_serial_str(SERIAL_COM1_BASE, "TaskA created. PID: ");
        char pid_str_a[21];
        uint64_to_dec_str(task_a->pid, pid_str_a);
        print_serial_str(SERIAL_COM1_BASE, pid_str_a);
        print_serial_str(SERIAL_COM1_BASE, "\n");
        print_serial(SERIAL_COM1_BASE, "Attempting to enqueue TaskA...\n");
        if (enqueue_task(&ready_queue, task_a) == 0) {
            print_serial_str(SERIAL_COM1_BASE, "TaskA enqueued successfully.\n");
        } else {
            print_serial_str(SERIAL_COM1_BASE, "Failed to enqueue TaskA.\n");
        }
    } else {
        print_serial_str(SERIAL_COM1_BASE, "Failed to create TaskA.\n");
    }

    print_serial(SERIAL_COM1_BASE, "Attempting to create TaskB...\n");
    task_t *task_b = create_task("TaskB", dummy_task_b_main, (uint64_t)kernel_pml4_phys);
    if (task_b) {
        print_serial_str(SERIAL_COM1_BASE, "TaskB created. PID: ");
        char pid_str_b[21];
        uint64_to_dec_str(task_b->pid, pid_str_b);
        print_serial_str(SERIAL_COM1_BASE, pid_str_b);
        print_serial_str(SERIAL_COM1_BASE, "\n");
        print_serial(SERIAL_COM1_BASE, "Attempting to enqueue TaskB...\n");
        if (enqueue_task(&ready_queue, task_b) == 0) {
            print_serial_str(SERIAL_COM1_BASE, "TaskB enqueued successfully.\n");
        } else {
            print_serial_str(SERIAL_COM1_BASE, "Failed to enqueue TaskB.\n");
        }
    } else {
        print_serial_str(SERIAL_COM1_BASE, "Failed to create TaskB.\n");
    }
    print_serial(SERIAL_COM1_BASE, "--- Dummy Task Creation and Enqueueing Complete ---\n\n");

    print_serial(SERIAL_COM1_BASE, "Setting up initial task for execution...\n");
    if (is_task_queue_empty(&ready_queue)) {
        panic("Ready queue is empty after task creation! Cannot start scheduler.");
    }

    current_task = dequeue_task(&ready_queue);
    if (current_task == NULL) {
        panic("Failed to dequeue initial task!");
    }

    print_serial_str(SERIAL_COM1_BASE, "Dequeued initial task: ");
    print_serial_str(SERIAL_COM1_BASE, current_task->name);
    print_serial_str_hex(SERIAL_COM1_BASE, "\n  PID: ", current_task->pid);
    print_serial_str_hex(SERIAL_COM1_BASE, "  Kernel Stack Top (for RSP0): ", current_task->kernel_stack_top);
    print_serial_str_hex(SERIAL_COM1_BASE, "  Initial RIP: ", current_task->context.rip);
    print_serial_str_hex(SERIAL_COM1_BASE, "  Initial RSP: ", current_task->context.rsp_user);
    print_serial_str_hex(SERIAL_COM1_BASE, "  Initial RFLAGS: ", current_task->context.rflags);
    print_serial_str_hex(SERIAL_COM1_BASE, "  Initial CR3 (phys): ", current_task->context.cr3);


    tss_set_rsp0(current_task->kernel_stack_top);
    print_serial_str_hex(SERIAL_COM1_BASE, "TSS.RSP0 set for current_task: ", current_task->kernel_stack_top);

    // For the very first task, its CR3 should already be the active kernel CR3.
    // If we were switching to a task with a *different* address space, we'd do:
    // if (get_current_cr3() != current_task->context.cr3) { // get_current_cr3() needs to be implemented
    //     load_cr3(current_task->context.cr3);
    //     print_serial_str_hex(SERIAL_COM1_BASE, "Loaded new CR3 for task: ", current_task->context.cr3);
    // }


    print_serial(SERIAL_COM1_BASE, "\nEnabling interrupts and halting CPU (waiting for scheduler via timer to start first task).\n");
    asm volatile ("sti"); // Enable interrupts
    while(1) {
        asm volatile ("hlt"); // Halt CPU until next interrupt (first timer interrupt will trigger schedule)
    }
}

// --- Utility Functions ---
// (Keep implementations)
void hcf(void) {
    asm volatile ("cli");
    for (;;) {
        asm volatile ("hlt");
    }
}

void *memcpy(void *dest, const void *src, size_t n) {
    (void)src; // Suppress unused parameter warning
    (void)n;   // Suppress unused parameter warning
    return dest;
}

void *memset(void *s, int c, size_t n) {
    (void)c; // Suppress unused parameter warning
    (void)n; // Suppress unused parameter warning
    return s;
}

void uint64_to_dec_str(uint64_t value, char *buffer) {
    if (buffer == NULL) return;
    if (value == 0) {
        buffer[0] = '0';
        buffer[1] = '\0';
        return;
    }
    char temp[21]; // Max 20 digits for uint64_t + null terminator
    int i = 0;
    while (value > 0) {
        temp[i++] = (value % 10) + '0';
        value /= 10;
    }
    int j = 0;
    while (i > 0) {
        buffer[j++] = temp[--i];
    }
    buffer[j] = '\0';
}

void uint64_to_hex_str(uint64_t value, char *buffer) {
    const char *hex_chars = "0123456789ABCDEF";
    if (buffer == NULL) return;
    if (value == 0) {
        buffer[0] = '0';
        buffer[1] = '\0';
        return;
    }
    char temp[17]; // Max 16 hex digits + null terminator
    int i = 0;
    while (value > 0) {
        temp[i++] = hex_chars[value % 16];
        value /= 16;
    }
    int j = 0;
    while (i > 0) {
        buffer[j++] = temp[--i];
    }
    buffer[j] = '\0';
}

// NEW panic function implementation
void panic(const char *message) {
    print_serial(SERIAL_COM1_BASE, "KERNEL PANIC: ");
    print_serial(SERIAL_COM1_BASE, message);
    print_serial(SERIAL_COM1_BASE, "\nSystem Halted.\n");
    hcf(); // Halt the system
    // Ensure panic never returns
    for(;;) {
        asm volatile ("cli; hlt");
    }
}

// --- Framebuffer Drawing Functions (Definitions) ---
// Definitions MUST match declarations in main.h (no fb argument)
void fill_screen(uint32_t color) {
    if (!framebuffer || !framebuffer->address) return;
    // Assuming bpp is 32, framebuffer->address is uint32_t aligned.
    // Pitch is in bytes. Width and height are in pixels.
    uint32_t *fb_ptr = (uint32_t *)framebuffer->address;
    uint64_t pitch_in_pixels = framebuffer->pitch / (framebuffer->bpp / 8);

    for (uint64_t y = 0; y < framebuffer->height; y++) {
        for (uint64_t x = 0; x < framebuffer->width; x++) {
            fb_ptr[y * pitch_in_pixels + x] = color;
        }
    }
    // Reset cursor after filling
    cursor_x = 0;
    cursor_y = 0;
}

// Updated put_char implementation with integrated scaling
void put_char(char c, int x_char_pos, int y_char_pos) {
    if (!framebuffer || !framebuffer->address) return;
    if ((uint8_t)c >= 128) c = '?'; // Handle out-of-range ASCII
    const uint8_t* glyph = font8x8_basic[(uint8_t)c];

    // Calculate base screen coordinates (top-left corner of the scaled character cell)
    int base_screen_x = x_char_pos * FONT_DATA_WIDTH * FONT_SCALE;
    int base_screen_y = y_char_pos * FONT_DATA_HEIGHT * FONT_SCALE;

    uint32_t *fb_ptr = (uint32_t *)framebuffer->address;
    // Calculate pitch in terms of pixels (uint32_t elements)
    uint64_t pitch_in_pixels = framebuffer->pitch / (framebuffer->bpp / 8);

    for (int cy = 0; cy < FONT_DATA_HEIGHT; cy++) { // Loop rows (font data y)
        uint8_t row_bits = glyph[cy]; // Get the bitmap for the current row
        for (int cx = 0; cx < FONT_DATA_WIDTH; cx++) { // Loop columns (font data x)
            // Determine color based on font bitmap bit
            // Corrected logic: Check bits from LSB (0) to MSB (7) as cx increases
            uint32_t pixel_color = (row_bits & (1 << cx)) ? text_color : bg_color;

            // Draw the scaled pixel block
            for (int sy = 0; sy < FONT_SCALE; sy++) { // Scale Y loop
                for (int sx = 0; sx < FONT_SCALE; sx++) { // Scale X loop
                    int final_x = base_screen_x + cx * FONT_SCALE + sx;
                    int final_y = base_screen_y + cy * FONT_SCALE + sy;

                    // Bounds check before writing to framebuffer
                    if (final_x >= 0 && (uint64_t)final_x < framebuffer->width &&
                        final_y >= 0 && (uint64_t)final_y < framebuffer->height) {
                        fb_ptr[final_y * pitch_in_pixels + final_x] = pixel_color;
                    }
                }
            }
        }
    }
}

// Definition matching main.h declaration: void put_string(const char *str);
void put_string(const char *str) {
    if (!framebuffer || !framebuffer->address) return;
    for (int i = 0; str[i] != '\0'; i++) {
        char c = str[i];
        if (c == '\n') {
            cursor_x = 0;
            cursor_y += EFFECTIVE_FONT_HEIGHT;
        } else if (c == '\r') {
            cursor_x = 0;
        } else {
            if (cursor_x + EFFECTIVE_FONT_WIDTH > (int)framebuffer->width) {
                cursor_x = 0;
                cursor_y += EFFECTIVE_FONT_HEIGHT;
            }
            if (cursor_y + EFFECTIVE_FONT_HEIGHT > (int)framebuffer->height) {
                fill_screen(bg_color);
                cursor_x = 0;
                cursor_y = 0;
            }
            // Pass character grid coordinates
            put_char(c, cursor_x / EFFECTIVE_FONT_WIDTH, cursor_y / EFFECTIVE_FONT_HEIGHT);
            cursor_x += EFFECTIVE_FONT_WIDTH;
        }
    }
}

// Definition matching main.h declaration: void put_hex(uint64_t value);
void put_hex(uint64_t value) {
    char hex_str[17];
    uint64_to_hex_str(value, hex_str);
    put_string("0x");
    put_string(hex_str);
}

// --- Serial Port Helper Functions ---
// (Implementations - assuming print_serial, uint64_to_hex/dec exist)
void print_serial_str_hex(uint16_t port, const char* str, uint64_t value) {
    print_serial(port, str);
    char hex_str[17];
    uint64_to_hex_str(value, hex_str);
    print_serial(port, hex_str);
    print_serial(port, "\n");
}
void print_serial_str_int(uint16_t port, const char* str, uint64_t value) {
    print_serial(port, str);
    char int_str[21];
    uint64_to_dec_str(value, int_str);
    print_serial(port, int_str);
    print_serial(port, "\n");
}

// Added: clear_screen_with_color (same as fill_screen but maybe more descriptive name for some uses)
void clear_screen_with_color(uint32_t color) {
    fill_screen(color);
}

// Added: set_text_color
void set_text_color(uint32_t color) {
    text_color = color;
}

// Added: set_bg_color
void set_bg_color(uint32_t color) {
    bg_color = color;
}

// Added: put_string_at
void put_string_at(const char *s, int x_char_pos, int y_char_pos, uint32_t fg, uint32_t bg) {
    uint32_t old_text_color = text_color;
    uint32_t old_bg_color = bg_color;
    int old_cursor_x = cursor_x;
    int old_cursor_y = cursor_y;

    set_text_color(fg);
    set_bg_color(bg);
    // Calculate pixel position from character grid position
    cursor_x = x_char_pos * EFFECTIVE_FONT_WIDTH;
    cursor_y = y_char_pos * EFFECTIVE_FONT_HEIGHT;

    put_string(s);

    // Restore old colors and cursor position
    text_color = old_text_color;
    bg_color = old_bg_color;
    cursor_x = old_cursor_x;
    cursor_y = old_cursor_y;
}

// Added: print_serial_str (wrapper for print_serial)
// This matches the new declaration in main.h
void print_serial_str(uint16_t port, const char* str) {
    print_serial(port, str);
}

// Added: put_string_at_serial (prints to serial, ignoring position)
void put_string_at_serial(const char *s) {
    print_serial(SERIAL_COM1_BASE, s);
}
