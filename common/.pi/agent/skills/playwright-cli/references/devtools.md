# DevTools

## Console & Network Logs

```bash
playwright-cli console
playwright-cli console warning
playwright-cli network
```

## Eval & Run Code

```bash
playwright-cli eval "document.title"
playwright-cli eval "el => el.textContent" e5
playwright-cli run-code "async page => await page.context().grantPermissions(['geolocation'])"
playwright-cli run-code --filename=script.js
```

## Tracing

```bash
playwright-cli tracing-start
# ... perform actions ...
playwright-cli tracing-stop
```

## Video Recording

```bash
playwright-cli video-start video.webm
playwright-cli video-chapter "Chapter Title" --description="Details" --duration=2000
playwright-cli video-stop
```
