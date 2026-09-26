import { checkEnv, type Report, type CheckOptions } from "env-precheck";
const options: CheckOptions = {
  contract: { name: ".env.example", text: "A=" },
  environment: { A: "hello" },
};
const report: Report = checkEnv(options);
const success: boolean = report.ok;
// @ts-expect-error check reports do not expose environment values
report.values;
// @ts-expect-error strings are required
checkEnv({ contract: { name: "example", text: "A=" }, environment: { A: 42 } });
void success;
