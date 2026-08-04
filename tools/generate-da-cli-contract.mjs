#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';

const siteRoot = resolve(import.meta.dirname, '..');
const candidateRoot = resolve(process.argv[2] || process.env.DA_CLI_REPO || '../da-cli');
const outputFile = resolve(siteRoot, 'dogfood', 'da-cli-command-contract.json');
const releaseContractFile = resolve(siteRoot, 'dogfood', 'release-contract.json');
const packageFile = resolve(candidateRoot, 'package.json');
const manifestFile = resolve(candidateRoot, 'docs', 'rubric', '0.6.0', 'manifest.json');

const [{ makeCommands }, { buildCommandInventory }, packageText, manifestText] = await Promise.all([
  import(pathToFileURL(resolve(candidateRoot, 'src', 'command-set.js'))),
  import(pathToFileURL(resolve(candidateRoot, 'src', 'lib', 'command-inventory.js'))),
  readFile(packageFile, 'utf8'),
  readFile(manifestFile, 'utf8'),
]);

const packageJson = JSON.parse(packageText);
const rubric = JSON.parse(manifestText);
const inventory = buildCommandInventory();
const root = new Command('da');
makeCommands().forEach((command) => root.addCommand(command));
const commandNodes = new Map();
walk(root, []);

const commands = inventory.map((row) => {
  const command = commandNodes.get(row.path);
  if (!command) throw new Error(`Commander node missing for ${row.path}`);
  return {
    ...row,
    options: command.options.map(optionContract),
  };
});

const contract = {
  schemaVersion: 'da-cli.command-contract.v1',
  package: packageJson.name,
  release: rubric.release,
  phase: 'final-candidate',
  generatedOn: git('show', '-s', '--format=%cs', 'HEAD'),
  source: {
    repository: 'somarc/da-cli',
    commit: git('rev-parse', 'HEAD'),
    tree: git('rev-parse', 'HEAD^{tree}'),
    packageVersion: packageJson.version,
    rubricManifestSha256: sha256(manifestText),
    inventorySource: rubric.inventorySource,
    commandCount: commands.length,
  },
  rootOptions: [
    { long: '--org', takesValue: true },
    { long: '--repo', takesValue: true },
    { long: '--branch', takesValue: true },
    { long: '--env', takesValue: true },
    { long: '--format', takesValue: true },
    { long: '--log-level', takesValue: true },
    { long: '--log-file', takesValue: true },
    { long: '--request-id', takesValue: true },
    { long: '--dry-run', takesValue: false },
    { long: '--commit', takesValue: false },
    { long: '--quiet', takesValue: false },
    { long: '--verbose', takesValue: false },
  ],
  commands,
};

const contractText = `${JSON.stringify(contract, null, 2)}\n`;
await writeFile(outputFile, contractText);
const releaseContract = JSON.parse(await readFile(releaseContractFile, 'utf8'));
releaseContract.validatedOn = contract.generatedOn;
releaseContract.source = {
  repository: contract.source.repository,
  commit: contract.source.commit,
  tree: contract.source.tree,
  packageVersion: contract.source.packageVersion,
  rubricManifestSha256: contract.source.rubricManifestSha256,
};
releaseContract.commandContract = {
  path: 'dogfood/da-cli-command-contract.json',
  schemaVersion: contract.schemaVersion,
  sha256: sha256(contractText),
  commandCount: contract.source.commandCount,
};
await writeFile(releaseContractFile, `${JSON.stringify(releaseContract, null, 2)}\n`);
console.log(`Wrote ${outputFile}`);
console.log(`Updated ${releaseContractFile}`);
console.log(`Pinned ${contract.source.repository}@${contract.source.commit} (${commands.length} executable paths).`);

function walk(parent, ancestors) {
  parent.commands.forEach((command) => {
    const path = [...ancestors, command.name()];
    commandNodes.set(path.join(' '), command);
    walk(command, path);
  });
}

function optionContract(option) {
  return {
    flags: option.flags,
    short: option.short || null,
    long: option.long || null,
    takesValue: Boolean(option.required || option.optional),
    variadic: Boolean(option.variadic),
  };
}

function git(...args) {
  return execFileSync('git', ['-C', candidateRoot, ...args], { encoding: 'utf8' }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
