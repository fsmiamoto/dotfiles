#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <sys/types.h>
#include <sys/sysctl.h>
#include <unistd.h>
#include <mach/mach.h>
#include <mach/mach_host.h>
#include <mach/host_info.h>


struct ram {
  host_t host;
  mach_msg_type_number_t count;
  vm_statistics64_data_t vm_stats;

  uint64_t total_memory;
  uint64_t free_memory;
  uint64_t used_memory;

  vm_size_t page_size;

  int used_percent;
  int free_percent;
  int memory_pressure;
};

static inline void ram_init(struct ram* ram) {
  ram->host = mach_host_self();
  ram->count = HOST_VM_INFO64_COUNT;

  // Page Size
  vm_size_t page_size;
  if(host_page_size(ram->host, &ram->page_size) != KERN_SUCCESS) {
    perror("failed to get page size");
  }

  // Get total physical memory
  uint64_t total_mem;
  size_t size = sizeof(total_mem);
  if (sysctlbyname("hw.memsize", &ram->total_memory, &size, NULL, 0) != 0) {
    perror("failed to get total memory");
  }
}

static inline void ram_update(struct ram* ram) {
  vm_statistics64_data_t vm_stat;
  mach_msg_type_number_t count = HOST_VM_INFO64_COUNT;
  if (host_statistics64(ram->host, HOST_VM_INFO64, (host_info64_t)&vm_stat, &count) != KERN_SUCCESS) {
    perror("failed to get ram statistics");
  }

  ram->free_memory = (vm_stat.free_count + vm_stat.inactive_count) * (uint64_t)ram->page_size;
  ram->used_memory = ram->total_memory - ram->free_memory;

  ram->free_percent = (double)ram->free_memory/ram->total_memory * 100.0;
  ram->used_percent = (double)ram->used_memory/ram->total_memory * 100.0;

  size_t size = sizeof(ram->used_memory);
  if (sysctlbyname("vm.memory_pressure", &ram->memory_pressure, &size, NULL, 0) != 0) {
    perror("failed to get memory pressure");
  }

}
