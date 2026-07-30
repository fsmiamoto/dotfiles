bin/gpu_load: gpu_load.c ../sketchybar.h | bin
	clang -std=c99 -O3 $< -o $@ -framework IOKit -framework CoreFoundation

bin:
	mkdir bin
