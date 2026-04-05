# Raw Output

The `--raw` flag strips page status, generated code, and snapshot sections from output, returning only the result value. Use it to pipe into other tools.

```bash
# extract and process data
playwright-cli --raw eval "JSON.stringify(performance.timing)" | jq '.loadEventEnd - .navigationStart'
playwright-cli --raw eval "JSON.stringify([...document.querySelectorAll('a')].map(a => a.href))" > links.json

# diff snapshots
playwright-cli --raw snapshot > before.yml
playwright-cli click e5
playwright-cli --raw snapshot > after.yml
diff before.yml after.yml

# extract values
TOKEN=$(playwright-cli --raw cookie-get session_id)
playwright-cli --raw localstorage-get theme
```

Commands that don't produce output return nothing with `--raw`.
