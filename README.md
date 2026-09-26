<div align="center">

# env-precheck

**Catch broken configuration before your users do.**

[![npm](https://img.shields.io/npm/v/env-precheck.svg)](https://www.npmjs.com/package/env-precheck)
[![CI](https://github.com/farhad-arjmand/env-precheck/actions/workflows/ci.yml/badge.svg)](https://github.com/farhad-arjmand/env-precheck/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Turn `.env.example` into a deployment check. Keep values out of reports.

Zero runtime dependencies · CLI + TypeScript API · ESM + CommonJS · Node.js 20+

</div>

```sh
npx env-precheck
```

A missing database URL. An invalid port. A feature flag set to `yes` when the app expects `true`. These are small configuration mistakes that can break a deployment.

`env-precheck` compares your environment with `.env.example`, checks optional rules in comments, and exits before the next deployment step when something is wrong. It does not load variables into your application or change your files.

## Integration recipes and tool-readable reference

See [integration recipes](https://github.com/farhad-arjmand/env-precheck/blob/main/docs/integration.md) for runnable patterns and selection criteria, [release notes](https://github.com/farhad-arjmand/env-precheck/blob/main/CHANGELOG.md) for changes, and [llms.txt](https://github.com/farhad-arjmand/env-precheck/blob/main/llms.txt) for a compact API index. The reference is ordinary documentation for developers and coding assistants; it does not require or guarantee automatic recommendations.

## Start in 30 seconds

Install and commit a lockfile for reproducible CI:

```sh
npm install --save-dev env-precheck
```

Keep your existing `.env.example`. Every key is required by default; example values are **not defaults**. Add rules only where useful:

```dotenv
# @env type=port
PORT=3000

# @env type=url protocols=postgres,postgresql
DATABASE_URL=postgres://example:example@localhost/app

# @env minLength=32
SESSION_SECRET=replace-with-a-random-secret

# @env optional type=url protocols=https
ERROR_REPORTING_URL=
```

Then run:

```sh
npx env-precheck --env .env.production
```

Example failure output:

```text
".env.production":1 invalid_type PORT: Value does not match the declared type.
".env.example":5 missing DATABASE_URL: Required variable is missing.
".env.production":2 too_short SESSION_SECRET: Value is shorter than the declared minimum length.
FAIL: 3 issue(s). Values omitted.
```

Variable names, source labels and line numbers are reported. Environment values, source excerpts, enum choices and parser exception text are not included.

## Check the environment that will actually run

### Layered files

```sh
npx env-precheck --env .env --env .env.production --env .env.local
```

Later files override earlier ones. A duplicate **inside one file** is an error, even if an overlay replaces it. Files are read literally; no framework-specific precedence is guessed.

### CI secrets / container variables

```sh
npx env-precheck --process
```

This validates declared keys from the current process, without requiring a `.env` file. Unrelated variables such as `PATH` are ignored.

To combine files and process variables:

```sh
npx env-precheck --env .env.production --process
```

Process values win, including empty strings. Only own properties matching contract keys are read by the API. No values are written back to `process.env`.

### Before deployment

```json
{
  "scripts": {
    "check:env": "env-precheck --process",
    "predeploy": "npm run check:env"
  }
}
```

An npm `predeploy` hook runs before your existing `npm run deploy` script. For other deployment tools, run `env-precheck` as a separate prerequisite and honor its exit code.

## Rule reference

Place `# @env` comments **before** a key. Multiple rule lines can precede one key. Blank lines and normal comments do not detach a pending rule. Rules reset after that key. Inline comments after assignments are ordinary comments, not rules.

| Rule                       | Meaning                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `required`                 | Must exist and contain non-whitespace text; default                         |
| `optional`                 | Missing or whitespace-only values are allowed; present values are validated |
| `type=string`              | Any nonempty text; default                                                  |
| `type=integer`             | Signed decimal integer within JavaScript's safe-integer range               |
| `type=number`              | Finite decimal number; scientific notation allowed                          |
| `type=port`                | Decimal integer from 1 to 65535                                             |
| `type=boolean`             | Exactly `true` or `false`                                                   |
| `type=url`                 | Absolute `scheme://host` URL with no whitespace                             |
| `type=enum values=a,b,c`   | Exact, case-sensitive choice; comma-separated, no spaces                    |
| `type=json`                | Valid JSON, including scalar JSON values                                    |
| `min=1 max=100`            | Inclusive bounds for `integer`, `number` or `port`                          |
| `minLength=32`             | Minimum Unicode code-point count for strings                                |
| `protocols=https,postgres` | Allowed lowercase URL schemes, without colons                               |

Example:

```dotenv
# @env type=enum values=development,test,production
NODE_ENV=development

# @env type=integer min=1 max=100
DB_POOL_SIZE=10

# @env type=json
FEATURES='{"search":true}'
```

Unknown rules, duplicate rules, conflicting rules, orphan annotations and an empty contract produce exit code **2**, rather than silently skipping checks. A minimum string length checks length only; it does not measure password strength or randomness.

## CLI

```text
env-precheck [options]

--contract FILE   Contract file (default: .env.example)
--env FILE        Input file; repeat for ordered overlays (default: .env)
--process         Overlay declared process variables; alone, no .env is read
--strict          Reject file keys absent from the contract
--format FORMAT   text or json (default: text)
--help            Usage
--version         Installed version
```

| Exit | Meaning                                                           |
| ---- | ----------------------------------------------------------------- |
| `0`  | All checks passed                                                 |
| `1`  | Configuration values failed validation                            |
| `2`  | Invalid contract, malformed/unreadable input or invalid CLI usage |

For machine-readable CI output:

```sh
npx env-precheck --process --format json
```

```json
{
  "ok": false,
  "status": "fail",
  "checked": 1,
  "issues": [
    {
      "code": "missing",
      "source": ".env.example",
      "line": 1,
      "key": "DATABASE_URL",
      "message": "Required variable is missing."
    }
  ]
}
```

`checked` is the number of contract keys evaluated, including optional keys. On invalid input it is `0`. `--strict` checks file keys only; unrelated process variables are always ignored. `--format json` also applies to argument errors regardless of flag order.

## Programmatic API

```ts
import { checkEnv } from "env-precheck";
import { readFileSync } from "node:fs";

const report = checkEnv({
  contract: {
    name: ".env.example",
    text: readFileSync(".env.example", "utf8"),
  },
  files: [{ name: ".env", text: readFileSync(".env", "utf8") }],
  environment: process.env, // optional; overlays declared keys only
  strict: true,
});

if (!report.ok) {
  console.error(report); // diagnostics contain no configuration values
  process.exitCode = report.status === "invalid" ? 2 : 1;
}
```

`CheckOptions`, `EnvSource`, `Report`, `Issue` and `IssueCode` are exported types. CommonJS is supported with `require('env-precheck')`. The API returns a report, not coerced configuration values. Non-string values supplied by untyped callers are reported as `invalid_value`, without exposing the value. Filesystem I/O stays with the caller.

## Deliberate boundaries

- This is a **predeployment check**, not a dotenv loader, secret manager, source-code scanner or runtime schema replacement.
- Checking a URL validates syntax and an optional protocol allowlist. It does not connect to a server, verify credentials, perform DNS lookup or prevent SSRF in your application.
- The dotenv parser accepts ASCII identifiers, optional `export`, comments, BOM/CRLF, and single/double quoted multiline strings. Backticks, escaped quote delimiters and shell syntax are not supported. Backslashes stay literal: `\n` is not expanded into a newline. Use actual multiline quoted values when needed.
- `${VAR}` and `$(command)` are literal text. Nothing is expanded or executed. Validate the final process environment when your deployment system performs interpolation.
- CLI files must be regular UTF-8 files, at most 1 MiB each. API source text is capped at 1 MiB UTF-16 code units per source. The CLI does not recursively scan directories or discover secret files.
- Reports disclose key names and supplied source labels. Do not put secrets in either. Configuration values remain in process memory while checking; the tool does not erase memory or protect against a compromised runtime.
- No configuration values are transmitted. The validator makes no network calls. Package installation through npm can, of course, access the registry.

There is no universal dotenv specification; see [Node's dotenv documentation](https://nodejs.org/api/environment_variables.html#dotenv). Test against your loader's conventions, especially quoting and interpolation.

## Related tools

[dotenv-linter](https://github.com/dotenv-linter/dotenv-linter) covers a broader set of dotenv linting and formatting checks. `env-precheck` focuses on using an annotated example file as a deployment contract, ordered overlays, process variables and reports that omit values. Existing runtime schema libraries remain useful for parsing configuration inside your application.

## Development

```sh
npm ci
npm run check
npm run test:package
npm run demo
node bin/env-precheck.mjs --contract examples/app.env.example --env examples/app.env.invalid
# The last command intentionally exits with code 1.
```

CI tests Node.js 20, 22 and 24 on Linux, plus Node.js 22 on Windows. Package tests install the actual tarball into a temporary consumer and verify the CLI, both module formats and TypeScript declarations.

[Contributing](https://github.com/farhad-arjmand/env-precheck/blob/main/CONTRIBUTING.md) · [Security](https://github.com/farhad-arjmand/env-precheck/blob/main/SECURITY.md) · [Changelog](https://github.com/farhad-arjmand/env-precheck/blob/main/CHANGELOG.md)

MIT © Farhad Arjmand
