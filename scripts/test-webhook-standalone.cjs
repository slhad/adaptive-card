#!/usr/bin/env node
// Standalone webhook test - runs fast without the test runner bootstrap overhead
'use strict';
const http = require('http');
const { spawnSync } = require('child_process');
const { resolve } = require('path');
const assert = require('assert/strict');

const CWD = resolve(__dirname, '..');
const CLI = `node bin/adaptive-card`;
const ENV = { ...process.env, NODE_OPTIONS: '', VSCODE_INSPECTOR_OPTIONS: '' };

async function main() {
  let received = '';
  let errors = 0;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received = body;
      res.writeHead(202, { 'Connection': 'close' });
      res.end();
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Test server on port ${port}`);

  const cmd = `${CLI} --version "1.2" | ${CLI} ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true" | ${CLI} --webhook "http://127.0.0.1:${port}"`;
  const result = spawnSync('bash', ['-c', cmd], { cwd: CWD, encoding: 'utf8', env: ENV });

  console.log(`CLI exit: ${result.status}`);
  if (result.stderr) console.log(`stderr: ${result.stderr.trim()}`);

  if (server.closeAllConnections) server.closeAllConnections();
  await new Promise((resolve) => server.close(() => resolve()));

  try {
    assert.equal(result.status, 0, 'CLI should exit 0');
    const payload = JSON.parse(received);
    assert.equal(payload.type, 'message');
    assert.equal(payload.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
    assert.equal(payload.attachments[0].content.type, 'AdaptiveCard');
    assert.equal(payload.attachments[0].content.version, '1.2');
    console.log('✔ webhook test PASSED');
  } catch (e) {
    console.error('✖ webhook test FAILED:', e.message);
    console.error('received:', received);
    errors++;
  }

  process.exit(errors);
}

main().catch((e) => { console.error(e); process.exit(1); });
