#include "ram.h"
#include "../sketchybar.h"

int main (int argc, char** argv) {
  float update_freq;
  if (argc < 3 || (sscanf(argv[2], "%f", &update_freq) != 1)) {
    printf("Usage: %s \"<event-name>\" \"<event_freq>\"\n", argv[0]);
    exit(1);
  }

  alarm(0);
  struct ram ram;
  ram_init(&ram);

  // Setup the event in sketchybar
  char event_message[512];
  snprintf(event_message, 512, "--add event '%s'", argv[1]);
  sketchybar(event_message);

  char trigger_message[512];
  for (;;) {
    // Acquire new info
    ram_update(&ram);

    // Prepare the event message
    snprintf(trigger_message,
             512,
             "--trigger '%s' used_percent='%d' free_percent='%02d' memory_pressure='%d'",
             argv[1],
             ram.used_percent,
             ram.free_percent,
             ram.memory_pressure                                        );

    // Trigger the event
    sketchybar(trigger_message);

    // Wait
    usleep(update_freq * 1000000);
  }
  return 0;
}
