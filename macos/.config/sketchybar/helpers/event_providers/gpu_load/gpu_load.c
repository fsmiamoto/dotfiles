#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <stdbool.h>
#include <stdio.h>
#include <unistd.h>

#include "../sketchybar.h"

static bool gpu_load_read(int *load) {
  io_service_t service = IOServiceGetMatchingService(
      kIOMainPortDefault, IOServiceMatching("IOAccelerator"));
  if (service == IO_OBJECT_NULL) return false;

  CFTypeRef property = IORegistryEntryCreateCFProperty(
      service, CFSTR("PerformanceStatistics"), kCFAllocatorDefault, 0);
  IOObjectRelease(service);

  if (!property || CFGetTypeID(property) != CFDictionaryGetTypeID()) {
    if (property) CFRelease(property);
    return false;
  }

  CFTypeRef value = CFDictionaryGetValue(
      (CFDictionaryRef)property, CFSTR("Device Utilization %"));
  bool valid = value && CFGetTypeID(value) == CFNumberGetTypeID()
               && CFNumberGetValue((CFNumberRef)value, kCFNumberIntType, load)
               && *load >= 0 && *load <= 100;

  CFRelease(property);
  return valid;
}

int main(int argc, char **argv) {
  float update_freq;
  if (argc < 3 || sscanf(argv[2], "%f", &update_freq) != 1) {
    printf("Usage: %s \"<event-name>\" \"<event_freq>\"\n", argv[0]);
    return 1;
  }

  alarm(0);

  char event_message[512];
  snprintf(event_message, sizeof(event_message), "--add event '%s'", argv[1]);
  sketchybar(event_message);

  char trigger_message[512];
  for (;;) {
    int load;
    if (gpu_load_read(&load)) {
      snprintf(trigger_message,
               sizeof(trigger_message),
               "--trigger '%s' load='%02d'",
               argv[1],
               load);
    } else {
      snprintf(trigger_message,
               sizeof(trigger_message),
               "--trigger '%s' load=''",
               argv[1]);
    }
    sketchybar(trigger_message);

    usleep(update_freq * 1000000);
  }
}
