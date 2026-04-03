AGENTS.md

Purpose

This file defines what human and automated agents must do to verify that the repository implements the requirements described in SPECS.md.

Principles

- Work TDD: add tests that encode the behavior in SPECS.md before changing code.
- Be explicit: every bullet in SPECS.md must map to at least one automated check (unit / integration / CLI test).
- CI must run lint, build and tests and fail the pipeline on any regression.

Quick verification (developer)

Run the following locally to validate the implementation:

1. Install dependencies

   npm ci

2. Lint

   npm run lint

3. Build (compile + prepare bin)

   npm run build

4. Run tests

   npm test

If all commands exit 0 and the test suite passes, the implementation satisfies the automated checks that exercise SPECS.md.

Mapping SPECS.md to checks (what to verify)

1) Alias / repo layout
- Verify repository root contains a .git folder (this repo root).
- Verify sources are in src/ and tests are in test/ (SPECS.md requirement).
- Verify compiled output lands in lib/ after `npm run build` and that lib/ is ignored by .gitignore.

2) Architecture
- NodeJS >= 22: ensure package.json "engines" contains node ">=22"; CI should run on node 22+.
- ESM: package.json must contain "type": "module" and tsconfig.module === "NodeNext".
- Typescript >= 6: devDependencies must include typescript 6.x.
- ESLint used before build: check package.json scripts (prebuild runs lint).
- `npm test` must run tests with `node --test` (see package.json scripts).

3) CLI / packaging
- package.json must expose a bin named "adaptive-card" pointing to lib/bin/adaptive-card.
- `npm run build` must produce lib/bin/adaptive-card that is executable and imports lib/src/cli.js (or equivalent).
- The CLI must be pipeable (read and write JSON on stdin/stdout) and behave the same when executed via `node bin/adaptive-card` in development.

4) Schema validation & assets
- The binary validates generated AdaptiveCard JSON against the Adaptive Card schema by default (unless skipped because of unresolved templates).
- Custom schema support (-c) must accept local file paths in ./assets and HTTPS URLs.
- The assets folder must contain any schema files used by tests (assets/clasp.json is used by the test-suite).

5) Special parameters
- -h: prints help and contains a link to https://adaptivecards.microsoft.com/designer.html
- -w: send card JSON to a webhook URL (POST JSON with Content-Type: application/json and the required enveloping payload)
- -c: accept a schema URL or local path and validate against it
- -e: read environment variables prefixed with AC_ and use them for templating
- -t: accept a JSON string or a file path; use values to perform template substitution

6) Sending to webhook
- The CLI must POST a JSON envelope with headers and body structure described in SPECS.md and return successful HTTP status (the test expects 202 in the suite).

7) TDD examples in SPECS.md
- Every CLI example in SPECS.md must be encoded as an automated test (see test/index.test.ts in this repo). Examples include default output, --version, errors, piping to add elements, -t/-e behavior and webhook sending.

CI / automation requirements for agents

Every automated agent (CI pipeline) MUST run the following steps in this order and fail the job if any step fails:

1. npm ci (or npm ci --prefer-offline in cache-enabled runners)
2. npm run lint
3. npm run build
4. npm test

If network calls are required by tests (e.g., remote schema validation), tests may skip remote checks when network is unavailable. Agents SHOULD run pipelines in network-enabled runners where possible.

PR reviewer checklist (human or bot)

- Ensure new functionality is accompanied by tests that prove the SPECS.md behavior.
- Confirm lint and type-checking are satisfied locally (npm run lint; tsc from the build script).
- Confirm build artifacts are not committed (lib/ must be ignored in .gitignore). CI will produce lib/ in the build step.
- Verify documentation updates: SPECS.md must be updated if the behavior changes. Add a note in the PR describing changes to SPECS.md and link to updated tests.
- Ensure CLI help (-h) includes the designer link and documents special flags.

How to add a new spec example

1. Add a new test in test/ using the existing style (node:test, spawnSync/spawn with the CLI defined as `node bin/adaptive-card`). Tests should be deterministic and avoid relying on flaky network resources.
2. Run npm test locally and iterate until the test passes.
3. Implement the code changes against the test. Commit tests and implementation in the same branch so CI can validate.

Automatic verification helper (copy/paste)

# quick-verify.sh (example)

#!/usr/bin/env bash
set -euo pipefail
npm ci
npm run lint
npm run build
npm test

echo "All SPECS.md checks passed."

If you want this script added to the repository, include it in the PR and update package.json with a script entry (e.g. "verify-specs": "./quick-verify.sh").

When to update SPECS.md

- Update SPECS.md when the intended CLI contract or behavior changes.
- When SPECS.md changes, update AGENTS.md and tests accordingly and add a migration note in the PR description.

Contact and ownership

- Tests live in test/ and are the primary source of truth for behavior. Keep them green.
- If a failing test is due to an intentional change in requirements, update SPECS.md and add/modify tests to reflect the new requirements.

Done criteria

A change is considered "implemented" with respect to SPECS.md when:
- Code compiles (npm run build) and lints
- The test suite (npm test) passes on CI and locally
- CLI behavior matches examples in SPECS.md or SPECS.md has been updated with the new contract

Notes

This repository already contains a test suite that encodes most of the examples in SPECS.md (see test/index.test.ts). Agents should prefer to extend those tests instead of duplicating test patterns. The goal of AGENTS.md is to make the acceptance criteria explicit and repeatable for both humans and automated agents.
