bin/ram_load: ram.h ram_load.c ../sketchybar.h | bin
	clang -std=c99 -O3 ram_load.c -o $@

clean:
	rm -rf ./bin/ram_load

bin:
	mkdir bin
