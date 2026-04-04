import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultCard,
  parsePath,
  getAtPath,
  setAtPath,
  applyProps,
  parseValue,
  applyTemplate,
} from '../src/card.js';

describe('card utilities (ts)', () => {
  it('createDefaultCard returns default schema and version', () => {
    const card = createDefaultCard();
    assert.deepEqual(card, {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.6',
    });
  });

  it('parsePath handles dot and bracket notation', () => {
    assert.deepEqual(parsePath('.'), []);
    assert.deepEqual(parsePath('.body[0]'), ['body', 0]);
    assert.deepEqual(parsePath('body[1].foo'), ['body', 1, 'foo']);
  });

  it('setAtPath and getAtPath create nested arrays and objects without mutating original', () => {
    const base = { body: [{ a: 1 }] } as unknown as { body: Array<{ a: number }> };
    const updated = setAtPath(base, ['body', 1], { items: [] }) as unknown as { body: unknown[] };
    assert.deepEqual(getAtPath(updated, ['body', 1]), { items: [] });
    assert.deepEqual(getAtPath(updated, ['body', 0]), { a: 1 });
    // original unchanged
    assert.equal(base.body.length, 1);
  });

  it('applyProps merges properties at the given path', () => {
    const card = createDefaultCard('1.2');
    const updated = applyProps(card, '.body[0]', { type: 'TextBlock', text: 'aaaa', wrap: true }) as unknown as {
      body: unknown[];
      version?: string;
    };
    assert.deepEqual(updated.body[0], { type: 'TextBlock', text: 'aaaa', wrap: true });
    assert.equal(updated.version, '1.2');
  });

  it('parseValue parses booleans, null, arrays and objects', () => {
    assert.equal(parseValue('true'), true);
    assert.equal(parseValue('false'), false);
    assert.equal(parseValue('null'), null);
    assert.deepEqual(parseValue('[1,2]'), [1, 2]);
    assert.deepEqual(parseValue('{"a":1}'), { a: 1 });
    assert.equal(parseValue('plain'), 'plain');
  });

  it('applyTemplate replaces placeholders and preserves escaping for JSON values', () => {
    const json = '{"speak":"{{theTemplateKey}}"}';
    const replaced = applyTemplate(json, { theTemplateKey: 'ho"ho' });
    const parsed = JSON.parse(replaced);
    assert.equal(parsed.speak, 'ho"ho');
  });
});
