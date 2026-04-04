import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

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
        ` | ${CLI} -w "http://127.0.0.1:${port}"`;

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

  describe('-o flag (output to file / stdout)', () => {
    it('writes generated JSON to a file when -o <path> is provided', () => {
      const tmpFile = resolve(tmpdir(), `ac_test_out_${process.pid}.json`);
      try {
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
      } catch (e) {
        void e;
      }

      const { stdout, status } = run(`${CLI} --version "1.2" -o "${tmpFile}"`);
      assert.equal(status, 0);
      // CLI should not write to stdout when -o <file> is used
      assert.equal(stdout, '');

      const fileContent = readFileSync(tmpFile, 'utf8');
      const card = JSON.parse(fileContent);
      assert.deepEqual(card, {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.2',
      });

      try {
        unlinkSync(tmpFile);
      } catch (e) {
        void e;
      }
    });

    it('sends to webhook and prints JSON to stdout when -w and -o - are combined', async () => {
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
        ` | ${CLI} -w "http://127.0.0.1:${port}" -o -`;

      const { stdout, status } = await runAsync(cmd);

      (server as unknown as { closeAllConnections(): void }).closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));

      assert.equal(status, 0);
      const payload = JSON.parse(received);
      assert.equal(payload.type, 'message');
      assert.equal(payload.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
      assert.equal(payload.attachments[0].content.type, 'AdaptiveCard');

      // stdout should contain the generated adaptive card JSON
      const printed = JSON.parse(stdout);
      assert.equal(printed.type, 'AdaptiveCard');
      assert.equal(printed.version, '1.2');
    });
  });

  describe('-h flag', () => {
    it('prints help text and exits 0', () => {
      const { stdout, status } = run(`${CLI} -h`);
      assert.equal(status, 0);
      assert.match(stdout, /adaptivecards\.microsoft\.com\/designer\.html/);
    });
  });

  describe('-c flag (custom schema)', () => {
    it('rejects scriptId shorter than 57 chars using local clasp schema', () => {
      const cmd = `${CLI} --version "1.2" | ${CLI} "." --scriptId "a" -c "./assets/clasp.json"`;
      const { stderr, status } = run(cmd);
      assert.notEqual(status, 0);
      assert.match(stderr, /Path "\.scriptId" : String is shorter than the minimum length of 57\./);
    });

    it('accepts valid scriptId using local clasp schema', () => {
      const validId = 'azertyuiopqsdfghjklmwxcvbn1234567890azertyuiopqsdfghjklmw';
      const cmd = `${CLI} --version "1.2" | ${CLI} "." --scriptId "${validId}" -c "./assets/clasp.json"`;
      const { stdout, status } = run(cmd);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.equal(card.scriptId, validId);
      assert.equal(card.version, '1.2');
    });

    it('-c with remote HTTPS schema URL: accepts valid scriptId (network)', async () => {
      const networkAvailable = await fetch('https://www.schemastore.org/clasp.json').then(() => true).catch(() => false);
      if (!networkAvailable) return; // skip if no network

      const validId = 'azertyuiopqsdfghjklmwxcvbn1234567890azertyuiopqsdfghjklmw';
      const cmd = `${CLI} --version "1.2" | ${CLI} "." --scriptId "${validId}" -c "https://www.schemastore.org/clasp.json"`;
      const { stdout, status } = await runAsync(cmd);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.equal(card.scriptId, validId);
      assert.equal(card.version, '1.2');
    });

    it('-c with remote HTTPS schema URL: rejects scriptId shorter than 57 chars (network)', async () => {
      const networkAvailable = await fetch('https://www.schemastore.org/clasp.json').then(() => true).catch(() => false);
      if (!networkAvailable) return; // skip if no network

      const cmd = `${CLI} --version "1.2" | ${CLI} "." --scriptId "a" -c "https://www.schemastore.org/clasp.json"`;
      const { stderr, status } = await runAsync(cmd);
      assert.notEqual(status, 0);
      assert.match(stderr, /Path "\.scriptId" : String is shorter than the minimum length of 57\./);
    });
  });

  describe('-t flag (template from string)', () => {
    it('replaces {{key}} with values from inline JSON string', () => {
      const cmd = `${CLI} --speak "{{sometemplateKey}}" | ${CLI} -t '{"sometemplateKey":"hellow!"}'`;
      const { stdout, status } = run(cmd);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.deepEqual(card, {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.6',
        speak: 'hellow!',
      });
    });
  });

  describe('-t flag (template from file)', () => {
    it('replaces {{key}} with values from a .tmpl file', () => {
      const tmpFile = '/tmp/ac_test_values.tmpl';
      const cmd = `echo '{"sometemplateKey":"=hola="}' > ${tmpFile} && ${CLI} --speak "{{sometemplateKey}}" | ${CLI} -t ${tmpFile}`;
      const { stdout, status } = run(cmd);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.deepEqual(card, {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.6',
        speak: '=hola=',
      });
    });
  });

  describe('-e flag (template from env vars)', () => {
    it('replaces {{key}} with AC_key env var values', () => {
      const cmd = `${CLI} --speak "{{theTemplateKey}}" | AC_theTemplateKey=hohohooo ${CLI} -e`;
      const { stdout, status } = run(cmd, undefined);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.deepEqual(card, {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard',
        version: '1.6',
        speak: 'hohohooo',
      });
    });
  });

  describe('placeholder passthrough (unresolved {{}})', () => {
    it('unresolved placeholders suppress schema validation', () => {
      const { stdout, status } = run(`${CLI} --speak "{{someKey}}"`);
      assert.equal(status, 0);
      const card = JSON.parse(stdout);
      assert.equal(card.speak, '{{someKey}}');
    });
  });

  describe('post-substitution validation', () => {
    it('post-substitution validation rejects invalid resolved card', () => {
      const cmd = `${CLI} --banana "{{someKey}}" | ${CLI} -t '{"someKey": "resolvedValue"}'`;
      const { stderr, status } = run(cmd);
      assert.notEqual(status, 0);
      assert.match(stderr, /Path "\." : Property banana is not allowed\./);
    });
  });
});
