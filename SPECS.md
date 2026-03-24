# adaptative-card specs

## Goal

Executing command

```bash
adaptive-card --version "1.2" | adaptive-card ".body[0]" --type "TextBlock" --text "*Yup*" --wrap "true" | adaptive-card --webhook "https://myawesomewebhook/someid"
```
should generate a json adapative card and sent it to the send it to the webhook

## Requirements

### Alias
[root] : workspace folder where there is the .git folder

### Architecture

- NodeJS 22+
- tests are running with "node --test"
- Typescript 6.0 is used
- Sources files are in [root]/src folder
- Compiled files are in [root]/lib folder
- Tests files are in [root]/test folder
- "adaptive-card" executable is usable in $PATH thanks to "npm link"
- "adaptive-card" is pipeable to itself for easier chaining
- "adaptive-card" validate the input (unless empty/null) against "http://adaptivecards.io/schemas/adaptive-card.json"
- "--webhook" or "-w" is a special parameter that send the input json to the webhook url
- .gitignore must ignore Compiled files
- npm package should produce an "adaptive-card" executable that is usable when package is installed globally with `npm install -g adaptive-card` later

### Sending adaptive card json to webhook

The adaptive card json (aka "content") need to be encapsulated to be sent to the webhook


- Header :
```text
Content-Type: application/json
```
- Data :
```jsonc
{
    "type": 'message',
    "attachments": [{
        "contentType": 'application/vnd.microsoft.card.adaptive',
        content
    }]
}
```

## TDD

### CLI usage

#### Generate default

##### Input
```bash
adaptive-card
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.6"
}
```

#### Generate default with version = 1.2 (Microsoft Teams Mobile support)

##### Input
```bash
adaptive-card --version "1.2"
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.2"
}
```

#### Schema validation error '.'

##### Input
```bash
adaptive-card --banana "yellow"
```

##### Error Output
```text
Path "." : Property banana is not allowed.
```

#### Adding a TextBlock

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true"
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.2",
    "body": [
        {
            "type": "TextBlock",
            "text": "aaaa",
            "wrap": true
        }
    ]
}
```

#### Adding a Container

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true" \
| adaptive-card ".body[1]" --type "Container" --items "[]"
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.2",
    "body": [
        {
            "type": "TextBlock",
            "text": "aaaa",
            "wrap": true
        },
        {
            "type": "Container",
            "items": []
        }
    ]
}
```

#### Adding a Container

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true" \
| adaptive-card ".body[1]" --type "Container" --items "[]"
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.2",
    "body": [
        {
            "type": "TextBlock",
            "text": "aaaa",
            "wrap": true
        },
        {
            "type": "Container",
            "items": []
        }
    ]
}
```

#### Schema validation error '.body[1]'

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true" \
| adaptive-card ".body[1]" --type "Container"
```

##### Error Output
```text
Path ".body[1]" : Missing property "items".
```

#### Send to webhook (special argument -w / --webhook)

##### Preparation

- $RPORT : temporary program that listen on a free random port > 1024

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true" | adaptive-card --webhook "https://localhost:${RPORT}
```

##### Output
A HTTP Response 202