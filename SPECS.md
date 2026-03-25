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
- ESM (ES Modules) are mandatory (`"type": "module"` in package.json, `"module": "NodeNext"` in tsconfig)
- tests are running with "node --test"
- Typescript >= 6.0 is used
- ESLint is used before build script
- Sources files are in [root]/src folder
- Compiled files are in [root]/lib folder
- Tests files are in [root]/test folder
- Assets files are in [root]/assets folder
- "adaptive-card" executable is usable in $PATH thanks to "npm link"
- "adaptive-card" is pipeable to itself for easier chaining
- "adaptive-card" validate the input (unless empty/null) against "http://adaptivecards.io/schemas/adaptive-card.json"

- .gitignore must ignore Compiled files
- npm package should produce an "adaptive-card" executable that is usable when package is installed globally with `npm install -g adaptive-card` later

### Special parameters (short hands)
- "-h" : display help text about the options of adaptive-card cli and :
    - Mention "https://adaptivecards.microsoft.com/designer.html" to make adaptative card template easily
- "-w" : send the input json to the webhook url
- "-c" : load/download a file in memory to validate the generated json
- "-e" : enable templating from environment variables prefixed with AC_
- "-t" : accept a json string like '{"text":"ok"}' or a file to template generated json by replacing '{{key}}' by the associated value

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

#### Send to webhook (special argument -w)

##### Preparation

- $RPORT : temporary program that listen on a free random port > 1024

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card ".body[0]" --type "TextBlock" --text "aaaa" --wrap "true" | adaptive-card -w "https://localhost:${RPORT}
```

##### Output
A HTTP Response 202

#### Use an alternative schema validation url (special arguemnt -c)

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card "." --scriptId "azertyuiopqsdfghjklmwxcvbn1234567890azertyuiopqsdfghjklmw" -c "https://www.schemastore.org/clasp.json"
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.2",
    "scriptId": "azertyuiopqsdfghjklmwxcvbn1234567890azertyuiopqsdfghjklmw"
}
```

#### Use an alternative schema validation url (special arguemnt -c)

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card "." --scriptId "a" -c "[root]/assets/clasp.json"
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.2",
    "scriptId": "azertyuiopqsdfghjklmwxcvbn1234567890azertyuiopqsdfghjklmw"
}
```
#### Schema validation error "." with an alternative schema validation file (special arguemnt -c)

##### Input
```bash
adaptive-card --version "1.2" | adaptive-card "." --scriptId "a" -c "[root]/assets/clasp.json"
```

##### Error Output
```text
Path ".scriptId" : String is shorter than the minimum length of 57.
```

#### Template a value from string (special argument -t)

##### Input
```bash
adaptive-card --somestring "{{sometemplateKey}}" | adaptive-card -t '{"sometemplateKey":"hellow!"}'
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.6",
    "somestring": "hellow!"
}
```

#### Template a value from file (special argument -t)

##### Input
```bash
echo '{"sometemplateKey":"=hola="}' > ./values.tmpl
adaptive-card --astring "{{sometemplateKey}}" | adaptive-card -t ./values.tmpl
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.6",
    "astring": "=hola="
}
```

#### Template a value from environment (special argument -e)

##### Input
```bash
adaptive-card --somestring "{{theTemplateKey}}" | AC_theTemplateKey=hohohooo adaptive-card -e
```

##### Output
```json
{
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.6",
    "somestring": "hohohooo"
}
```