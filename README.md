# DA CLI Docs Site

Public Edge Delivery Services documentation site for `@somarc/da-cli`.

## Environments

- Preview: `https://main--da-cli-eds--somarc.aem.page/`
- Live: `https://main--da-cli-eds--somarc.aem.live/`

## Purpose

This repo contains the public documentation site for DA CLI, including authored pages and static tool pages such as:

- `/commands`
- `/quickref`
- `/pipeline`
- `/api`
- `/agentic-workflow.html`
- `/tools/da-cli-flows.html`
- `/tools/da-cli-vs-helix-cli.html`

The static tool pages are hand-maintained and should include a visible DA CLI version marker when they describe command behavior.

## Local Development

```sh
npm install
npm run lint
npm run validate:flows
aem up
```

Use `aem up` for the normal local EDS development loop. Use `da up` from the DA CLI repo when validating DA CLI's agent-friendly local server behavior.

`npm run validate:flows` checks the static workflow explorer against the installed `da` command. To validate against a local checkout instead, pass `DA_BIN`:

```sh
DA_BIN="../da-cli/bin/da.js" npm run validate:flows
```
