export interface AdaptiveCard {
  $schema: string;
  type: 'AdaptiveCard';
  version: string;
  [key: string]: unknown;
}

export function createDefaultCard(version = '1.6'): AdaptiveCard {
  return {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version,
  };
}

export function parsePath(path: string): (string | number)[] {
  if (path === '.') return [];
  const str = path.startsWith('.') ? path.slice(1) : path;
  const parts: (string | number)[] = [];
  const re = /([^.[]+)|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    if (m[1] !== undefined) parts.push(m[1]);
    else parts.push(Number(m[2]));
  }
  return parts;
}

export function getAtPath(obj: unknown, path: (string | number)[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

export function setAtPath(obj: unknown, path: (string | number)[], value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...tail] = path;
  if (typeof head === 'number') {
    const arr = Array.isArray(obj) ? [...obj] : [];
    arr[head] = tail.length === 0 ? value : setAtPath(arr[head], tail, value);
    return arr;
  } else {
    const record =
      obj != null && typeof obj === 'object' && !Array.isArray(obj)
        ? { ...(obj as Record<string, unknown>) }
        : {};
    record[head] = tail.length === 0 ? value : setAtPath(record[head], tail, value);
    return record;
  }
}

export function applyProps(
  card: AdaptiveCard,
  path: string,
  props: Record<string, unknown>,
): AdaptiveCard {
  const parts = parsePath(path);
  const existing = getAtPath(card, parts);
  const merged = Object.assign({}, typeof existing === 'object' ? existing : {}, props);
  return setAtPath(card, parts, merged) as AdaptiveCard;
}

/** Parse a CLI argument value: booleans, null, arrays and objects are JSON-parsed; strings stay as-is */
export function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

/** Replace {{key}} placeholders in a JSON string with values from the provided map */
export function applyTemplate(jsonStr: string, values: Record<string, string>): string {
  return jsonStr.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return key in values ? values[key] : `{{${key}}}`;
  });
}
