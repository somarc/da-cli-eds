#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const flowFile = resolve(here, 'da-cli-flows.html');
const daBin = process.env.DA_BIN || 'da';

const html = await readFile(flowFile, 'utf8');
const syntaxes = [...html.matchAll(/syntax:"([^"]+)"/g)].map((match) => match[1]);

if (!syntaxes.length) {
  fail('No syntax entries found in tools/da-cli-flows.html.');
}

const checks = [];
for (const syntax of syntaxes) {
  for (const expression of splitSyntax(syntax)) {
    const tokens = commandTokens(expression);
    if (!tokens.length) {
      checks.push({ syntax, expression, ok: false, error: 'No command tokens parsed' });
      continue;
    }
    checks.push(validateCommandPath(syntax, expression, tokens));
  }
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  for (const check of failed) {
    console.error(`FAIL ${check.expression}`);
    console.error(`  source: ${check.syntax}`);
    console.error(`  ${check.error}`);
  }
  fail(`${failed.length}/${checks.length} mapped flow command(s) failed validation.`);
}

console.log(`Validated ${checks.length} mapped da-cli flow command(s) against ${daBin}.`);

function splitSyntax(syntax) {
  return syntax
    .split(/\s+(?:&&|\|)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function commandTokens(expression) {
  const tokens = expression.split(/\s+/);
  const daIndex = tokens.indexOf('da');
  if (daIndex < 0) return [];

  const command = [];
  for (let i = daIndex + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || token === 'da') continue;
    if (token.startsWith('<') || token.startsWith('[')) break;
    if (token.startsWith('--')) {
      if (takesValue(token) && i + 1 < tokens.length) i += 1;
      continue;
    }
    if (token.startsWith('-')) {
      if (takesValue(token) && i + 1 < tokens.length) i += 1;
      continue;
    }
    command.push(token);
  }
  return command;
}

function takesValue(token) {
  return !token.includes('=')
    && !['--commit', '--dry-run', '--force', '--global', '--json', '--quiet', '--verbose'].includes(token);
}

function validateCommandPath(syntax, expression, tokens) {
  for (let end = tokens.length; end >= 1; end -= 1) {
    const candidate = tokens.slice(0, end);
    const result = runDa([...candidate, '--help']);
    if (result.status === 0 && result.stdout.includes(`Usage: da ${candidate.join(' ')}`)) {
      return {
        syntax,
        expression,
        ok: true,
        command: candidate.join(' '),
      };
    }
  }

  const result = runDa([...tokens, '--help']);
  return {
    syntax,
    expression,
    ok: false,
    error: (result.stderr || result.stdout || `No help output for parsed tokens: ${tokens.join(' ')}`).trim(),
  };
}

function runDa(args) {
  const result = spawnSync(daBin, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
