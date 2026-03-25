import { Ajv, type ErrorObject } from 'ajv';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePath, getAtPath } from './card.js';

const _require = createRequire(import.meta.url);
const addFormats = _require('ajv-formats') as (ajv: Ajv) => Ajv;

const SCHEMA_URI = 'http://adaptivecards.io/schemas/adaptive-card.json';

let ajvInstance: Ajv | null = null;
let rootValidateFn: ReturnType<Ajv['compile']> | null = null;

/** Recursively convert draft-06 `id` to `$id` so AJV v8 can process the schema.
 *  Also strips the meta-schema `$schema` declaration to avoid AJV fetching draft-06. */
function normalizeDraft06(val: unknown, isRoot = false): unknown {
  if (Array.isArray(val)) return val.map((v) => normalizeDraft06(v));
  if (val !== null && typeof val === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (isRoot && k === '$schema') continue; // strip meta-schema reference
      result[k === 'id' ? '$id' : k] = normalizeDraft06(v);
    }
    return result;
  }
  return val;
}

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({ strict: false, allErrors: true });
    addFormats(ajvInstance);
    const raw = JSON.parse(
      readFileSync(new URL('./adaptive-card-schema.json', import.meta.url), 'utf8'),
    );
    const schema = normalizeDraft06(raw, true) as object;
    ajvInstance.addSchema(schema, SCHEMA_URI);
  }
  return ajvInstance;
}

function getRootValidator(): ReturnType<Ajv['compile']> {
  if (!rootValidateFn) {
    rootValidateFn = getAjv().compile({ $ref: SCHEMA_URI });
  }
  return rootValidateFn;
}

function cliPathToJsonPointer(cliPath: string): string {
  if (cliPath === '.') return '';
  return (
    '/' +
    cliPath
      .replace(/^\./, '')
      .replace(/\[(\d+)\]/g, '/$1')
      .replace(/\./g, '/')
  );
}

function jsonPointerToCliPath(jsonPointer: string, baseCliPath: string): string {
  if (jsonPointer === '') return baseCliPath;
  const sub = jsonPointer
    .replace(/^\//, '')
    .replace(/\/(\d+)/g, '[$1]')
    .replace(/\//g, '.');
  if (baseCliPath === '.') return '.' + sub;
  return baseCliPath + '.' + sub;
}

function formatError(error: ErrorObject, cliPath: string): string | null {
  const displayPath = jsonPointerToCliPath(error.instancePath, cliPath);
  if (error.keyword === 'additionalProperties') {
    const prop = (error.params as { additionalProperty: string }).additionalProperty;
    return `Path "${displayPath}" : Property ${prop} is not allowed.`;
  }
  if (error.keyword === 'required') {
    const prop = (error.params as { missingProperty: string }).missingProperty;
    return `Path "${displayPath}" : Missing property "${prop}".`;
  }
  if (error.keyword === 'minLength') {
    const limit = (error.params as { limit: number }).limit;
    return `Path "${displayPath}" : String is shorter than the minimum length of ${limit}.`;
  }
  return null;
}

function stripExternalRefs(val: unknown): void {
  if (Array.isArray(val)) {
    for (const item of val) stripExternalRefs(item);
  } else if (val !== null && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj['$ref'] === 'string' && (obj['$ref'] as string).startsWith('http')) {
      for (const k of Object.keys(obj)) delete obj[k];
      return;
    }
    for (const v of Object.values(obj)) stripExternalRefs(v);
  }
}

/**
 * Validate a card against the adaptive card schema.
 * Returns an array of formatted error messages (empty = valid).
 */
export function validateCard(card: unknown, cliPath: string): string[] {
  const ajv = getAjv();
  const rootValidator = getRootValidator();
  const valid = rootValidator(card);

  if (valid) return [];

  const allErrors = rootValidator.errors ?? [];

  // For non-root paths: validate the specific node against its type-specific definition
  if (cliPath !== '.') {
    const parts = parsePath(cliPath);
    const node = getAtPath(card, parts);

    if (node != null && typeof node === 'object' && 'type' in node) {
      const nodeType = (node as { type: string }).type;
      try {
        const typeValidator = ajv.compile({ $ref: `${SCHEMA_URI}#/definitions/${nodeType}` });
        const typeValid = typeValidator(node);
        if (!typeValid) {
          const errors = (typeValidator.errors ?? [])
            .map((e) => formatError(e, cliPath))
            .filter((e): e is string => e !== null);
          if (errors.length > 0) return errors;
        }
      } catch {
        // Definition not found, fall through to generic handling
      }
    }

    // Fallback: filter allErrors by instancePath
    const jsonPointer = cliPathToJsonPointer(cliPath);
    const pathErrors = allErrors
      .filter(
        (e) => e.instancePath === jsonPointer || e.instancePath.startsWith(jsonPointer + '/'),
      )
      .map((e) => formatError(e, cliPath))
      .filter((e): e is string => e !== null);
    if (pathErrors.length > 0) return pathErrors;
  }

  // Root path or fallback: look for errors at instancePath ''
  const rootErrors = allErrors
    .filter((e) => e.instancePath === '')
    .map((e) => formatError(e, cliPath))
    .filter((e): e is string => e !== null);

  return rootErrors;
}

/**
 * Validate a card (or sub-node) against a custom JSON Schema loaded from a URL or local file.
 * Returns an array of formatted error messages (empty = valid).
 */
export async function validateCardWithCustomSchema(
  card: unknown,
  cliPath: string,
  schemaUrlOrPath: string,
): Promise<string[]> {
  let schemaJson: string;
  if (schemaUrlOrPath.startsWith('http://') || schemaUrlOrPath.startsWith('https://')) {
    const response = await fetch(schemaUrlOrPath);
    schemaJson = await response.text();
  } else {
    const absolutePath = resolve(process.cwd(), schemaUrlOrPath);
    schemaJson = readFileSync(absolutePath, 'utf8');
  }

  const rawSchema = JSON.parse(schemaJson);
  const schema = normalizeDraft06(rawSchema, true);
  stripExternalRefs(schema);

  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema as object);

  const target = cliPath === '.' ? card : getAtPath(card, parsePath(cliPath));
  const valid = validate(target);
  if (valid) return [];

  return (validate.errors ?? [])
    .map((e) => formatError(e, cliPath))
    .filter((e): e is string => e !== null);
}
