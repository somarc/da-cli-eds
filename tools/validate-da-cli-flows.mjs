#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const flowFile = resolve(here, 'da-cli-flows.html');
const comparisonFile = resolve(here, 'da-cli-vs-helix-cli.html');
const releaseContractFile = resolve(siteRoot, 'dogfood', 'release-contract.json');
const commandContractFile = resolve(siteRoot, 'dogfood', 'da-cli-command-contract.json');
const candidateMode = process.argv.includes('--candidate');
const candidateRepo = resolve(process.env.DA_CLI_REPO || '../da-cli');
const daBin = process.env.DA_BIN || resolve(candidateRepo, 'bin', 'da.js');

const [html, comparisonHtml, releaseContractText, commandContractText] = await Promise.all([
  readFile(flowFile, 'utf8'),
  readFile(comparisonFile, 'utf8'),
  readFile(releaseContractFile, 'utf8'),
  readFile(commandContractFile, 'utf8'),
]);
const releaseContract = parseJson(releaseContractText, 'dogfood/release-contract.json');
const commandContract = parseJson(commandContractText, 'dogfood/da-cli-command-contract.json');

validateContracts(releaseContract, commandContract, commandContractText);
validateReleaseMarkers([html, comparisonHtml], releaseContract);

const syntaxes = extractSyntaxes(html);
if (!syntaxes.length) fail('No syntax entries found in tools/da-cli-flows.html.');

const commandRows = new Map(commandContract.commands.map((command) => [command.path, command]));
const commandPaths = [...commandRows.keys()]
  .map((path) => ({ path, tokens: path.split(' ') }))
  .sort((a, b) => b.tokens.length - a.tokens.length);
const rootOptions = new Map(commandContract.rootOptions.flatMap((option) => optionNames(option).map((name) => [name, option])));
const checks = [];

for (const syntax of syntaxes) {
  for (const expression of splitSyntax(syntax)) {
    checks.push(validateExpression({ syntax, expression }));
  }
}

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  failed.forEach((check) => {
    console.error(`FAIL ${check.expression}`);
    console.error(`  source: ${check.syntax}`);
    console.error(`  ${check.error}`);
  });
  fail(`${failed.length}/${checks.length} mapped flow expression(s) failed contract validation.`);
}

if (candidateMode) validateCandidate(releaseContract, commandContract, checks);

console.log(`Validated ${checks.length} mapped flow expression(s) against the pinned ${commandContract.source.commandCount}-path command contract.`);
console.log(`Validated static tool markers against ${releaseContract.package} ${releaseContract.version} (${releaseContract.phase}).`);
if (candidateMode) console.log(`Validated candidate provenance and help at ${releaseContract.source.commit.slice(0, 12)} via ${daBin}.`);

function validateExpression({ syntax, expression }) {
  const tokens = tokenize(expression);
  const daIndex = tokens.indexOf('da');
  if (daIndex < 0) return { syntax, expression, ok: false, error: 'Expression does not invoke da.' };

  const args = tokens.slice(daIndex + 1);
  let commandOffset = 0;
  while (commandOffset < args.length && isOptionToken(args[commandOffset])) {
    const name = normalizeOption(args[commandOffset]);
    const option = rootOptions.get(name);
    if (!option) return { syntax, expression, ok: false, error: `Unknown root option before command: ${name}` };
    commandOffset += option.takesValue && !args[commandOffset].includes('=') ? 2 : 1;
  }

  const match = commandPaths.find(({ tokens: pathTokens }) => pathTokens.every((token, index) => args[commandOffset + index] === token));
  if (!match) return { syntax, expression, ok: false, error: 'No pinned executable command path matches this expression.' };

  const command = commandRows.get(match.path);
  const allowedOptions = new Map(rootOptions);
  commandAncestors(match.path).forEach((path) => {
    const row = commandRows.get(path);
    row?.options?.forEach((option) => optionNames(option).forEach((name) => allowedOptions.set(name, option)));
  });

  const usedOptions = tokens
    .filter(isOptionToken)
    .map(normalizeOption)
    .filter(Boolean);
  const unknownOptions = usedOptions.filter((option) => !allowedOptions.has(option));
  if (unknownOptions.length) {
    return { syntax, expression, ok: false, error: `Unknown option(s) for da ${match.path}: ${[...new Set(unknownOptions)].join(', ')}` };
  }
  if (command.requiresCommit && !usedOptions.includes('--commit')) {
    return { syntax, expression, ok: false, error: `da ${match.path} is commit-gated but the displayed syntax omits root --commit.` };
  }

  return { syntax, expression, ok: true, command: match.path };
}

function validateContracts(release, commands, commandText) {
  const requiredReleaseKeys = [
    'schemaVersion', 'package', 'version', 'phase', 'validatedOn', 'source',
    'commandContract', 'canonicalManifest', 'pipelines', 'packageAvailability',
    'candidateValidation', 'notes',
  ];
  requiredReleaseKeys.forEach((key) => {
    if (!(key in release)) fail(`release-contract.json is missing ${key}.`);
  });
  if (release.schemaVersion !== 'da-cli-eds.release-contract.v1') fail('Unsupported release-contract schemaVersion.');
  if (release.package !== '@somarc/da-cli') fail('release-contract package must be @somarc/da-cli.');
  if (release.version !== '0.6.0') fail('release-contract version must be 0.6.0 for this cut.');
  if (!['final-candidate', 'released'].includes(release.phase)) fail('release-contract phase must be final-candidate or released.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(release.validatedOn)) fail('release-contract validatedOn must be YYYY-MM-DD.');
  if (!/^[a-f0-9]{40}$/.test(release.source?.commit || '')) fail('release-contract source.commit must be an immutable 40-character SHA.');
  if (!/^[a-f0-9]{40}$/.test(release.source?.tree || '')) fail('release-contract source.tree must be an immutable Git tree SHA.');
  if (!/^[a-f0-9]{64}$/.test(release.source?.rubricManifestSha256 || '')) fail('release-contract source.rubricManifestSha256 must be SHA-256.');
  if (release.commandContract?.path !== 'dogfood/da-cli-command-contract.json') fail('release-contract commandContract.path must use the checked contract snapshot.');
  if (release.commandContract?.schemaVersion !== 'da-cli.command-contract.v1') fail('release-contract commandContract.schemaVersion is unsupported.');
  if (release.commandContract?.sha256 !== sha256(commandText)) fail('Pinned command-contract SHA-256 does not match its checked file.');
  if (release.canonicalManifest !== 'dogfood/canonical-pages.txt') fail('release-contract canonicalManifest must use the reviewed page manifest.');
  if (release.pipelines?.certify !== 'dogfood/certify.yaml' || release.pipelines?.promote !== 'dogfood/promote.yaml') {
    fail('release-contract pipelines must identify the checked certification and promotion plans.');
  }
  const released = release.phase === 'released';
  if (release.packageAvailability?.targetVersionPublished !== released) {
    fail(`release-contract package availability must match phase ${release.phase}.`);
  }
  if (released && release.packageAvailability?.publishedVersionAtValidation !== release.version) {
    fail('Released contract must bind the published target version.');
  }
  if (release.candidateValidation?.publicCI !== 'immutable-contract-snapshot'
    || release.candidateValidation?.exactSourceGate !== 'maintainer-local-private-source') {
    fail('release-contract candidateValidation must state the public/private validation boundary.');
  }

  if (commands.schemaVersion !== 'da-cli.command-contract.v1') fail('Unsupported command-contract schemaVersion.');
  if (commands.package !== release.package || commands.release !== release.version || commands.phase !== release.phase) {
    fail('Command contract package/release/phase does not match release-contract.json.');
  }
  if (!Array.isArray(commands.commands) || !Array.isArray(commands.rootOptions)) fail('Command contract must include commands and rootOptions arrays.');
  if (commands.commands.length !== release.commandContract.commandCount) fail('Command contract count does not match release-contract.json.');
  if (commands.source.commandCount !== commands.commands.length) fail('Command contract source.commandCount is stale.');
  ['commit', 'tree', 'packageVersion', 'rubricManifestSha256'].forEach((key) => {
    if (commands.source[key] !== release.source[key]) fail(`Command contract source.${key} does not match release-contract.json.`);
  });
  const paths = commands.commands.map((command) => command.path);
  if (new Set(paths).size !== paths.length) fail('Command contract contains duplicate executable paths.');

  const manifest = readFileSync(resolve(siteRoot, release.canonicalManifest), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!manifest.length) fail('Canonical page manifest is empty.');
  if (new Set(manifest).size !== manifest.length) fail('Canonical page manifest contains duplicate paths.');
  if (manifest.some((path) => !/^\/[a-z0-9/-]+\.html$/.test(path))) fail('Canonical page manifest contains a non-canonical HTML path.');
  if (manifest.some((path) => path.startsWith('/drafts/'))) fail('Canonical page manifest must exclude drafts.');
}

function validateReleaseMarkers(files, contract) {
  const expected = contract.phase === 'released' ? `${contract.version} release` : `${contract.version} final candidate`;
  files.forEach((content, index) => {
    const name = index === 0 ? 'da-cli-flows.html' : 'da-cli-vs-helix-cli.html';
    if (!content.includes(contract.package) || !content.includes(expected)) {
      fail(`${name} is missing the ${contract.package} ${expected} marker.`);
    }
    if (!content.includes(contract.validatedOn)) fail(`${name} is missing validation date ${contract.validatedOn}.`);
    if (/\b0\.[0-5]\.\d+\b/.test(content)) fail(`${name} still contains a pre-0.6 DA CLI version marker.`);
  });
  if (files[0].includes('snowflake template')) fail('da-cli-flows.html still describes the retired snowflake site-create path.');
  if (/helix-query\.ya?ml/i.test(files[0])) fail('da-cli-flows.html still describes the retired file-backed index model.');
}

function validateCandidate(release, commands, expressions) {
  const head = git('rev-parse', 'HEAD');
  const tree = git('rev-parse', 'HEAD^{tree}');
  if (head !== release.source.commit) fail(`Candidate HEAD ${head} does not match pinned ${release.source.commit}.`);
  if (tree !== release.source.tree) fail(`Candidate tree ${tree} does not match pinned ${release.source.tree}.`);
  if (git('status', '--porcelain')) fail('Candidate source tree is dirty.');

  const manifestFile = resolve(candidateRepo, 'docs', 'rubric', '0.6.0', 'manifest.json');
  const manifestText = readFileSync(manifestFile, 'utf8');
  if (sha256(manifestText) !== release.source.rubricManifestSha256) fail('Candidate rubric manifest digest does not match the release contract.');

  const version = runDa(['--version']).stdout.trim();
  if (version !== release.source.packageVersion) fail(`Candidate runtime version ${version} does not match source.packageVersion ${release.source.packageVersion}.`);

  const statusResult = runDa(['--format', 'json', 'status']);
  if (statusResult.status !== 0) fail(`Candidate status probe failed: ${(statusResult.stderr || statusResult.stdout).trim()}`);
  const status = parseJson(statusResult.stdout, 'candidate status output');
  const cli = status?.data?.cli;
  if (status?.ok !== true || status?.operation !== 'status') fail('Candidate status output is not the contracted success envelope.');
  if (cli?.version !== release.source.packageVersion) fail('Candidate status version does not match the release contract.');
  if (cli?.installKind !== 'source-tree') fail(`Candidate install kind ${cli?.installKind || 'missing'} is not source-tree.`);
  if (!cli?.git?.sha || !release.source.commit.startsWith(cli.git.sha)) fail('Candidate status Git SHA does not match the pinned commit.');
  if (cli?.git?.dirty !== false) fail('Candidate status reports a dirty source tree.');

  const uniquePaths = [...new Set(expressions.map((check) => check.command))];
  uniquePaths.forEach((path) => {
    const result = runDa([...path.split(' '), '--help']);
    if (result.status !== 0 || !result.stdout.includes(`Usage: da ${path}`)) {
      fail(`Candidate help does not expose pinned path da ${path}: ${(result.stderr || result.stdout).trim()}`);
    }
  });

  const packageContract = commands.source.packageVersion;
  if (packageContract !== version) fail('Command-contract packageVersion does not match candidate runtime.');

  validatePipelinePlan(release, 'certify', 'preview pages');
  validatePipelinePlan(release, 'promote', 'publish pages');
}

function validatePipelinePlan(release, name, expectedCommand) {
  const pipeline = release.pipelines[name];
  const result = runDa([
    '--org', 'somarc', '--repo', 'da-cli-eds', '--branch', 'main', '--env', 'prod',
    'pipeline', 'run', pipeline, '--dry-run', '--format', 'json',
  ]);
  if (result.status !== 0) fail(`${name} pipeline dry-run failed: ${(result.stderr || result.stdout).trim()}`);
  const plan = parseJson(result.stdout, `${name} pipeline plan`);
  if (plan?.ok !== true || plan?.operation !== 'pipeline.plan' || !Array.isArray(plan?.data?.steps)) {
    fail(`${name} pipeline did not emit a valid dry-run plan.`);
  }
  const mutation = plan.data.steps.find((step) => step.command.startsWith(`${expectedCommand} `));
  if (!mutation) fail(`${name} pipeline is missing ${expectedCommand}.`);
  if (!mutation.command.includes(release.canonicalManifest)) fail(`${name} pipeline does not use the canonical manifest.`);
  const contractAudit = plan.data.steps.find((step) => step.command.startsWith('audit contracts '));
  if (!contractAudit) fail(`${name} pipeline is missing the code-bus contract audit.`);
  if (name === 'certify' && !contractAudit.depends_on.includes(mutation.id)) {
    fail('Certification must preview the new manifest before auditing its rendered block contracts.');
  }
  if (name === 'promote') {
    if (!mutation.depends_on.includes(contractAudit.id)) fail('Promotion must audit block contracts before publishing.');
    if (mutation.requires_approval !== true) fail('Promotion publish step must require explicit pipeline approval.');
  }
}

function extractSyntaxes(content) {
  return [...content.matchAll(/syntax:"((?:\\.|[^"\\])*)"/g)].map((match) => JSON.parse(`"${match[1]}"`));
}

function splitSyntax(syntax) {
  return syntax.split(/\s+(?:&&|\|)\s+/).map((part) => part.trim()).filter(Boolean);
}

function tokenize(expression) {
  return expression.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\S+/g) || [];
}

function commandAncestors(path) {
  const words = path.split(' ');
  return words.map((_, index) => words.slice(0, index + 1).join(' '));
}

function optionNames(option) {
  return [option.short, option.long].filter(Boolean);
}

function isOptionToken(token) {
  return /^\[?-{1,2}[a-z]/i.test(token || '');
}

function normalizeOption(token) {
  return token.replace(/^\[/, '').replace(/[\],;]+$/, '').split('=')[0];
}

function runDa(args) {
  const result = spawnSync(daBin, args, {
    cwd: siteRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function git(...args) {
  return execFileSync('git', ['-C', candidateRepo, ...args], { encoding: 'utf8' }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseJson(value, name) {
  try { return JSON.parse(value); }
  catch (error) { fail(`${name} is invalid JSON: ${error.message}`); }
  return null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
