import { createDefaultCard, applyProps, parseValue } from './card.js';
import { validateCard } from './validator.js';
import { sendToWebhook } from './webhook.js';

interface ParsedArgs {
  path: string;
  props: Record<string, unknown>;
  webhookUrl: string | null;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  let path = '.';
  const props: Record<string, unknown> = {};
  let webhookUrl: string | null = null;

  let i = 0;

  // First positional arg (starts with '.') is the JSON path
  if (args[i] !== undefined && args[i].startsWith('.')) {
    path = args[i];
    i++;
  }

  while (i < args.length) {
    const arg = args[i];
    if (arg === '--webhook' || arg === '-w') {
      webhookUrl = args[++i];
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      props[key] = parseValue(args[++i]);
    }
    i++;
  }

  return { path, props, webhookUrl };
}

async function run(input: string | null, argv: string[]): Promise<void> {
  const { path, props, webhookUrl } = parseArgs(argv);

  // Validate piped input (if any) before processing
  let card = input
    ? (JSON.parse(input) as ReturnType<typeof createDefaultCard>)
    : createDefaultCard();

  // Apply props at the specified path
  if (Object.keys(props).length > 0 || path !== '.') {
    card = applyProps(card, path, props);
  }

  // Validate the resulting card
  const errors = validateCard(card, path);
  if (errors.length > 0) {
    for (const err of errors) {
      process.stderr.write(err + '\n');
    }
    process.exit(1);
  }

  if (webhookUrl) {
    await sendToWebhook(card, webhookUrl);
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
