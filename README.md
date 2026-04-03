adaptive-card
=============

A small CLI to generate validated Adaptive Card JSON and optionally send it to a webhook (eg. Microsoft Teams).

Install

- Locally for development:

  npm ci
  npm run build

- Globally from npmjs.org:

  npm install -g adaptive-card

Usage

The CLI is available as `adaptive-card` when installed globally. Examples (see SPECS.md for full contract):

- Generate default adaptive card:

  adaptive-card

- Set version:

  adaptive-card --version "1.2"

- Pipe to add a TextBlock:

  adaptive-card --version "1.2" | adaptive-card ".body[0]" --type "TextBlock" --text "Hello" --wrap "true"