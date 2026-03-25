#!/usr/bin/env bash
# Runs the test suite outside of VS Code's debugger auto-attach
cd "$(dirname "$0")/.."
unset NODE_OPTIONS
unset VSCODE_INSPECTOR_OPTIONS
node --test lib/test/index.test.js
