#!/usr/bin/env node
// Quick manual test of the webhook functionality
'use strict';
const http = require('http');
const { spawnSync } = require('child_process');
const { resolve } = require('path');

const CWD = resolve(__dirname, '..');
const CLI = 'node bin/adaptive-card';
const ENV = { ...process.env, NODE_OPTIONS: '', VSCODE_INSPECTOR_OPTIONS: '' };

let received = '';
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    received = body;
    res.writeHead(202);
    res.end();
  });
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  console.log('Server on port', port);

  const cmd = `${CLI} --version "1.2" | ${CLI} ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true" | ${CLI} --webhook "http://127.0.0.1:${port}"`;
  
  const result = spawnSync('bash', ['-c', cmd], { cwd: CWD, encoding: 'utf8', env: ENV });
  console.log('spawnSync exit:', result.status);
  console.log('stderr:', result.stderr);

  server.close(() => {
    console.log('received body:', received.slice(0, 200));
    try {
      const payload = JSON.parse(received);
      console.log('type:', payload.type);
      console.log('contentType:', payload.attachments[0].contentType);
      console.log('content.type:', payload.attachments[0].content.type);
      console.log('ALL WEBHOOK TESTS PASSED');
    } catch (e) {
      console.error('FAILED:', e.message);
      process.exit(1);
    }
  });
});
