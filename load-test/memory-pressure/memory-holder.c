#define _GNU_SOURCE

#include <errno.h>
#include <inttypes.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/mman.h>
#include <time.h>
#include <unistd.h>

static volatile sig_atomic_t should_stop = 0;

static void handle_signal(int signal_number)
{
  (void) signal_number;
  should_stop = 1;
}

static uint64_t parse_positive_integer(const char *value, const char *name)
{
  char *end = NULL;
  errno = 0;
  uint64_t result = strtoull(value, &end, 10);

  if (errno != 0 || end == value || *end != '\0' || result == 0) {
    fprintf(stderr, "[ERROR] Invalid %s.\n", name);
    exit(64);
  }

  return result;
}

static uint64_t monotonic_seconds(void)
{
  struct timespec current;

  if (clock_gettime(CLOCK_MONOTONIC, &current) != 0) {
    perror("clock_gettime");
    exit(1);
  }

  return (uint64_t) current.tv_sec;
}

int main(int argc, char **argv)
{
  if (argc != 3) {
    fprintf(stderr, "[ERROR] Expected fixed allocation bytes and timeout seconds.\n");
    return 64;
  }

  const uint64_t allocation_bytes = parse_positive_integer(argv[1], "allocation");
  const uint64_t timeout_seconds = parse_positive_integer(argv[2], "timeout");

  if (allocation_bytes > SIZE_MAX) {
    fprintf(stderr, "[ERROR] Allocation exceeds this platform's address space.\n");
    return 64;
  }

  struct sigaction action = {0};
  action.sa_handler = handle_signal;
  sigemptyset(&action.sa_mask);
  sigaction(SIGINT, &action, NULL);
  sigaction(SIGTERM, &action, NULL);

  unsigned char *memory = mmap(
    NULL,
    (size_t) allocation_bytes,
    PROT_READ | PROT_WRITE,
    MAP_PRIVATE | MAP_ANONYMOUS,
    -1,
    0
  );

  if (memory == MAP_FAILED) {
    perror("mmap");
    return 1;
  }

  if (mlock(memory, (size_t) allocation_bytes) != 0) {
    perror("mlock");
    munmap(memory, (size_t) allocation_bytes);
    return 1;
  }

  const long page_size = sysconf(_SC_PAGESIZE);
  if (page_size <= 0) {
    fprintf(stderr, "[ERROR] Unable to determine the memory page size.\n");
    munlock(memory, (size_t) allocation_bytes);
    munmap(memory, (size_t) allocation_bytes);
    return 1;
  }

  for (uint64_t offset = 0; offset < allocation_bytes; offset += (uint64_t) page_size) {
    memory[offset] = (unsigned char) (offset / (uint64_t) page_size);
  }
  memory[allocation_bytes - 1] = 1;

  printf(
    "[OK] Locked %" PRIu64 " bytes in RAM; holding for at most %" PRIu64 " seconds.\n",
    allocation_bytes,
    timeout_seconds
  );
  fflush(stdout);

  const uint64_t deadline = monotonic_seconds() + timeout_seconds;
  struct timespec sleep_interval = {.tv_sec = 1, .tv_nsec = 0};

  while (!should_stop && monotonic_seconds() < deadline) {
    nanosleep(&sleep_interval, NULL);
  }

  munlock(memory, (size_t) allocation_bytes);
  munmap(memory, (size_t) allocation_bytes);
  puts("[OK] Released the synthetic memory allocation.");
  return 0;
}
