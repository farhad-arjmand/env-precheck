# Contributing

Use Node.js 20 or later. Run `npm ci`, `npm run check` and `npm run test:package`.

Bug reports should include a minimal contract and environment using invented values. Do not paste real secrets, production environment files or credential-bearing URLs. Include the expected exit code and actual report.

Parser changes must have regression tests for comments, quoting, multiline values, duplicates and value-free error reporting. Rule changes must reject invalid annotations rather than silently ignoring them. Preserve deterministic file precedence and never execute expressions from environment files.

Discuss new rule syntax in an issue before implementing it. Keep the runtime dependency-free and keep file loading separate from the public checking API.
