# Security

Report vulnerabilities privately through this repository's GitHub security advisory reporting. Use invented test credentials; do not send production secrets.

The 1.x line is supported. Reports intentionally omit values, but include variable names and source labels. Do not put secrets in those labels. Input values exist in memory during checking; this is not a secret-storage system.

The tool performs no network access, no variable expansion, no command evaluation and no automatic file edits. URL checks do not test reachability or enforce application network policy. A passed contract proves only that the supplied inputs satisfy its declared rules; it does not prove application correctness or that the checked configuration matches a later deployment.
