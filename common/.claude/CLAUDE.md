## Agent’s toolbox (complementary to MCP server and skills tools)
- When the user wants you to read websites, fetch their content using
  `$ exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --dump-dom $URL | uvx markitdown`
  The call will return the website’s content converted to markdown.
  If markdown is not practicable, leave out the piping.
  As a generic fallback use you default Web Fetch tools.
