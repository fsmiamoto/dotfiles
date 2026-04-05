# Targeting Elements

## Refs (Default)

Use refs from the most recent snapshot to interact with elements.

```bash
playwright-cli snapshot
playwright-cli click e15
```

## CSS Selectors

```bash
playwright-cli click "#main > button.submit"
```

## Playwright Locators

```bash
# role locator
playwright-cli click "getByRole('button', { name: 'Submit' })"

# test id
playwright-cli click "getByTestId('submit-button')"
```
