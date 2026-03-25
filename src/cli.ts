import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDefaultCard, applyProps, parseValue, applyTemplate } from './card.js';
import { validateCard, validateCardWithCustomSchema } from './validator.js';
import { sendToWebhook } from './webhook.js';

interface ParsedArgs {
  path: string;
  props: Record<string, unknown>;
  webhookUrl: string | null;
  customSchemaPath: string | null;
  templateValues: Record<string, string> | null;
  useEnvTemplate: boolean;
}

const HELP_TEXT = `\
Usage: adaptive-card [path] [options]

  path              JSON path to target element (default: '.')

Options:
  --version         Print version number
  -w                Send card to a Teams webhook URL
  -c                Validate against a custom JSON Schema (URL or file path)
  -t                Use a JSON object or file as template values
  -e                Use AC_* environment variables as template values
  -h                Show this help message

Design templates at: https://adaptivecards.microsoft.com/designer.html
`;

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  if (args.includes('-h')) {
    process.stdout.write(HELP_TEXT);
    process.exit(0);
  }

  let path = '.';
  const props: Record<string, unknown> = {};
  let webhookUrl: string | null = null;
  let customSchemaPath: string | null = null;
  let templateValues: Record<string, string> | null = null;
  let useEnvTemplate = false;

  let i = 0;

  // First positional arg (starts with '.') is the JSON path
  if (args[i] !== undefined && args[i].startsWith('.')) {
    path = args[i];
    i++;
  }

  while (i < args.length) {
    const arg = args[i];
    if (arg === '-w') {
      webhookUrl = args[++i];
    } else if (arg === '-c') {
      customSchemaPath = args[++i];
    } else if (arg === '-t') {
      const tValue = args[++i];
      if (tValue.trimStart().startsWith('{')) {
        try {
          templateValues = JSON.parse(tValue);
        } catch {
          templateValues = JSON.parse(readFileSync(resolve(tValue), 'utf8'));
        }
      } else {
        templateValues = JSON.parse(readFileSync(resolve(tValue), 'utf8'));
      }
    } else if (arg === '-e') {
      useEnvTemplate = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      props[key] = parseValue(args[++i]);
    }
    i++;
  }

  return { path, props, webhookUrl, customSchemaPath, templateValues, useEnvTemplate };
}

async function run(input: string | null, argv: string[]): Promise<void> {
  const { path, props, webhookUrl, customSchemaPath, templateValues, useEnvTemplate } = parseArgs(argv);

  // Validate piped input (if any) before processing
  let card = input
    ? (JSON.parse(input) as ReturnType<typeof createDefaultCard>)
    : createDefaultCard();

  // Apply props at the specified path
  if (Object.keys(props).length > 0 || path !== '.') {
    card = applyProps(card, path, props);
  }

  const envValues: Record<string, string> = {};
  if (useEnvTemplate) {
    for (const [k, v] of Object.entries(process.env)) {
      if (k.startsWith('AC_') && v !== undefined) {
        envValues[k.slice(3)] = v;
      }
    }
  }

  const effectiveTemplateValues = templateValues ?? (useEnvTemplate ? envValues : null);

  // Validate the resulting card
  const hasPlaceholders = JSON.stringify(card).includes('{{');
  const skipValidation = hasPlaceholders || effectiveTemplateValues !== null;

  if (!skipValidation) {
    const errors = customSchemaPath
      ? await validateCardWithCustomSchema(card, path, customSchemaPath)
      : validateCard(card, path);
    if (errors.length > 0) {
      for (const err of errors) {
        process.stderr.write(err + '\n');
      }
      process.exit(1);
    }
  }

  if (webhookUrl) {
    await sendToWebhook(card, webhookUrl);
  } else if (effectiveTemplateValues !== null) {
    const jsonStr = applyTemplate(JSON.stringify(card, null, 4), effectiveTemplateValues);
    process.stdout.write(jsonStr + '\n');
  } else {
    process.stdout.write(JSON.stringify(card, null, 4) + '\n');
  }
}

function main(): void {
  if (process.stdin.isTTY) {
    run(null, process.argv).catch((err: unknown) => {
      process.stderr.write(String(err) + '\n');
      process.exit(1);
    });
  } else {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      run(data.trim() || null, process.argv).catch((err: unknown) => {
        process.stderr.write(String(err) + '\n');
        process.exit(1);
      });
    });
  }
}

main();
