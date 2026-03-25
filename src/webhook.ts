import { request } from 'http';
import { request as requestHttps } from 'https';

interface WebhookPayload {
  type: 'message';
  attachments: [
    {
      contentType: 'application/vnd.microsoft.card.adaptive';
      content: unknown;
    },
  ];
}

/**
 * Send an adaptive card to a Teams-compatible webhook URL.
 * Wraps the card in the required message envelope.
 */
export function sendToWebhook(card: unknown, webhookUrl: string): Promise<void> {
  const payload: WebhookPayload = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: card,
      },
    ],
  };

  const body = JSON.stringify(payload);
  const parsedUrl = new URL(webhookUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const requestFn = isHttps ? requestHttps : request;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Connection': 'close',
        },
      },
      (res) => {
        res.resume(); // Drain response
        const status = res.statusCode ?? 0;
        if (status >= 200 && status < 300) {
          resolve();
        } else {
          reject(new Error(`Webhook responded with status ${status}`));
        }
      },
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
