import { debug, getInput, warning } from '@actions/core';
import { readFileSync } from 'fs';
import { context } from '@actions/github';
import chalk from 'chalk';

export enum Mode {
  Comment = 'comment',
  Check = 'check',
}

export enum Conclusion {
  Success = 'success',
  Failure = 'failure',
  Cancelled = 'cancelled',
}

export type Inputs = {
  token: string;
  prefix: string;
  mode: Mode;
  name: string;
  title: string;
  summary: string;
  conclusion: Conclusion;
  body: string;
  annotations: string;
  repo: string;
  owner: string;
  sha: string;
  issue_number: number;
};

const addPrefix = (body: string, prefix?: string): string => {
  if (prefix && !body?.startsWith(prefix)) return `${prefix}\n${body}`;
  return body;
};

const isModeTypeGuard = (mode: string): mode is Inputs['mode'] => Object.values(Mode).map(String).includes(mode);
const isConclusionTypeGuard = (conclusion?: string): conclusion is Inputs['conclusion'] =>
  !conclusion || Object.values(Conclusion).map(String).includes(conclusion);

export const parseInputs = (): Inputs => {
  const token = getInput('token');

  const file = getInput('file');
  const message = getInput('message');

  const mode = getInput('mode');

  const prefix = getInput('prefix');
  const name = getInput('name');
  const title = getInput('title');
  const summary = getInput('summary');
  const conclusion = getInput('conclusion');
  const annotations = getInput('annotations');

  debug(`Resolved inputs:`);
  debug(`  token: '${chalk.blue(!!token?.length)}'`);
  debug(`  file: '${chalk.blue(file)}'`);
  debug(`  message: '${chalk.blue(message)}'`);
  debug(`  mode: '${chalk.blue(mode)}'`);
  debug(`  prefix: '${chalk.blue(prefix)}'`);
  debug(`  name: '${chalk.blue(name)}'`);
  debug(`  title: '${chalk.blue(title)}'`);
  debug(`  summary: '${chalk.blue(summary)}'`);
  debug(`  conclusion: '${chalk.blue(conclusion)}'`);

  if (!isModeTypeGuard(mode)) {
    throw new Error(`Mode ${mode} is not supported`);
  }
  if (!isConclusionTypeGuard(conclusion)) {
    throw new Error(`Conclusion '${conclusion}' is not a valid value of 'success', 'failure' or 'cancelled'.`);
  }

  if (!message && !file) {
    throw new Error('Either "file" or "message" is required as input.');
  }

  if (mode === Mode.Comment && !prefix) {
    throw new Error(`Input "prefix" is required as for mode '${mode}'.`);
  }
  if (mode === Mode.Check && (!name || !title || !summary || !conclusion)) {
    throw new Error(`Missing required input "name", "title", "summary" or "conclusion" for mode '${mode}'.`);
  }

  let body: string = message;
  if (!message && file) body = readFileSync(file, 'utf8');
  if (!body) throw new Error('A body is required.');
  if (mode === Mode.Comment) body = addPrefix(body, prefix);

  const repo = context.repo.repo;
  const owner = context.repo.owner;
  const sha = context.payload.pull_request?.head?.sha || context.sha;
  const issue_number = context.issue.number;

  if (mode === Mode.Check && !context.payload.pull_request?.head?.sha) {
    warning(chalk.yellow('No commit sha found in pull_request context. Falling back to head sha.'));
  }

  debug(`Context info:`);
  debug(`  repo: '${chalk.blue(repo)}'`);
  debug(`  owner: '${chalk.blue(owner)}'`);
  debug(`  sha: '${chalk.blue(sha)}'`);
  debug(`  issue_number: '${chalk.blue(issue_number)}'`);

  if (mode === Mode.Comment && !issue_number) {
    throw new Error('No issue/pull request in input neither in current context.');
  } else if (mode === Mode.Check && !sha) {
    throw new Error('No sha could be resolved.');
  }

  return { token, prefix, body, mode, conclusion, name, title, summary, annotations, repo, owner, issue_number, sha };
};
