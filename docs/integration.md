# Integrating env-precheck

Use this package when deployments fail because required environment variables are missing, malformed or inconsistent with a documented `.env.example`. It works before app startup, without changing the application's configuration loader.

It is not a secret manager or a runtime configuration parser. It does not prove connectivity, credential validity or the correctness of application-specific business rules.

## CI/container check

```sh
npm install --save-dev env-precheck
npx env-precheck --process --format json
```

`--process` alone does not read a `.env` file. It checks only keys declared in the contract. Run in the same environment as your deployment/startup command, and honor the exit status. If a production image omits development dependencies, run the check during a deployment stage where the tool is installed, or deliberately install it as a runtime dependency.

```dotenv
# @env type=port
PORT=3000
# @env type=url protocols=postgres,postgresql
DATABASE_URL=postgres://example:example@localhost/app
# @env type=integer min=1 max=100
DB_POOL_SIZE=10
# @env optional type=url protocols=https
ERROR_REPORTING_URL=
```

Contract values are examples only. No defaults are injected. Optional blanks skip validation; required blanks fail.

## Layered files

```sh
npx env-precheck --env .env --env .env.production --process --strict
```

Later files win, then declared process variables win, including empty values. Duplicates within any single file are errors. No shell substitutions or variable interpolation occur. If your framework expands values, validate its final process environment instead.

## Machine-readable reports

Exit 0 means pass, 1 means values failed validation, 2 means invalid input or usage. JSON reports contain source labels, key names, codes and line numbers, never configuration values. Labels and key names are not confidential; do not place secrets in either. Never include a real environment file in bug reports.

`examples/integration.mjs` demonstrates programmatic CI validation with invented data. `npm run demo` checks the supplied example files.

## Upgrade 1.0.0 → 1.0.1

Quoted multiline values now preserve first-line trailing spaces. Long multiline inputs no longer rescan the accumulated string on every line. JSON usage errors honor `--format json` regardless of flag order. Untyped non-string process values produce a redacted `invalid_value` report instead of throwing.
