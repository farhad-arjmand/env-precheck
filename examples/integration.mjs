import assert from "node:assert/strict";
import { checkEnv } from "../dist/esm/index.js";
const contract = {
  name: ".env.example",
  text: "# @env type=port\nPORT=3000\n# @env minLength=32\nSESSION_SECRET=",
};
const bad = checkEnv({
  contract,
  environment: { PORT: "99999", SESSION_SECRET: "invented-example" },
});
assert.equal(bad.ok, false);
assert.equal(bad.issues.length, 2);
assert.ok(!JSON.stringify(bad).includes("invented-example"));
const good = checkEnv({
  contract,
  environment: {
    PORT: "8080",
    SESSION_SECRET: "example-only-not-a-production-secret-123",
  },
});
assert.equal(good.ok, true);
console.log(
  "Invalid deployment rejected; corrected configuration passed; values omitted.",
);
