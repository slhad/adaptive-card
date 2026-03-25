import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = 'node bin/adaptive-card';
const CWD = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Strip inspector env vars so the spawned CLI processes don't get the debugger attached
const ENV = { ...process.env, NODE_OPTIONS: '', VSCODE_INSPECTOR_OPTIONS: '' };

function run(cmd: string, stdin?: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('bash', ['-c', cmd], {
    cwd: CWD,
    input: stdin,
    encoding: 'utf8',
    env: ENV,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 0,
  };
}

function runAsync(cmd: string): Promise<{ stdout: string; stderr: string; status: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', cmd], { cwd: CWD, env: ENV });
    child.stdin.end();
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code: number | null) => resolve({ stdout, stderr, status: code ?? 0 }));
  });
}

describe('adaptive-card CLI', () => {
  describe('generate default card', () => {
    it('outputs a default AdaptiveCard at version 1.6', () => {
      const { stdout, status } = run(CLI);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.deepEqual(card, {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.6',
      });
    });
  });

  describe('--version flag', () => {
    it('sets version to 1.2', () => {
      const { stdout, status } = run(`${CLI} --version "1.2"`);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.deepEqual(card, {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
      });
    });
  });

  describe('validation error at root', () => {
    it('rejects unknown root property', () => {
      const { stderr, status } = run(`${CLI} --banana "yellow"`);
      assert.notEqual(status, 0);
      assert.match(stderr, /Path "\." : Property banana is not allowed\./);
    });
  });

  describe('adding a TextBlock', () => {
    it('adds TextBlock to body[0] via pipe', () => {
      const cmd = `${CLI} --version "1.2" | ${CLI} ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true"`;
      const { stdout, status } = run(cmd);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.deepEqual(card, {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
        body: [{ type: 'TextBlock', text: 'aaaa', wrap: true }],
      });
    });
  });

  describe('adding a Container', () => {
    it('adds Container to body[1] via pipe', () => {
      const cmd =
        `${CLI} --version "1.2"` +
        ` | ${CLI} ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true"` +
        ` | ${CLI} ".body[1]" --type "Container" --items "[]"`;
      const { stdout, status } = run(cmd);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.deepEqual(card, {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
        body: [
          { type: 'TextBlock', text: 'aaaa', wrap: true },
          { type: 'Container', items: [] },
        ],
      });
    });
  });

  describe('validation error at .body[1]', () => {
    it('rejects Container missing required items', () => {
      const cmd =
        `${CLI} --version "1.2"` +
        ` | ${CLI} ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true"` +
        ` | ${CLI} ".body[1]" --type "Container"`;
      const { stderr, status } = run(cmd);
      assert.notEqual(status, 0);
      assert.match(stderr, /Path "\.body\[1\]" : Missing property "items"\./);
    });
  });

  describe('--webhook flag', () => {
    it('sends card to webhook and receives 202', async () => {
      let received = '';
      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk; });
        req.on('end', () => {
          received = body;
          res.writeHead(202, { 'Connection': 'close' });
          res.end();
        });
      });

      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;

      const cmd =
        `${CLI} --version "1.2"` +
        ` | ${CLI} ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true"` +
        ` | ${CLI} --webhook "http://127.0.0.1:${port}"`;

      const { status } = await runAsync(cmd);

      (server as unknown as { closeAllConnections(): void }).closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      assert.equal(status, 0);
      const payload = JSON.parse(received);
      assert.equal(payload.type, 'message');
      assert.equal(payload.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
      assert.equal(payload.attachments[0].content.type, 'AdaptiveCard');
    });
  });
});
