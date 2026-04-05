# Network Mocking

## Route Interception

```bash
# block images
playwright-cli route "**/*.jpg" --status=404

# mock API response
playwright-cli route "https://api.example.com/**" --body='{"mock": true}'

# list active routes
playwright-cli route-list

# remove specific route
playwright-cli unroute "**/*.jpg"

# remove all routes
playwright-cli unroute
```
