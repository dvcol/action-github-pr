import chalk from 'chalk';

import { getOctokit } from '@actions/github';
// eslint-disable-next-line import/no-unresolved -- false positive, issue with parsing subfolder, ignore this error
import { Endpoints } from '@octokit/types';
import { error, info } from '@actions/core';
import { Inputs } from './parse-inputs';
import { readFileSync } from 'fs';

export type Annotation = {
  /** @description The path of the file to add an annotation to. For example, `assets/css/main.css`. */
  path: string;
  /**
   * @description The level of the annotation.
   * @enum {string}
   */
  annotation_level: 'notice' | 'warning' | 'failure';
  /** @description A short description of the feedback for these lines of code. The maximum size is 64 KB. */
  message: string;
  /** @description The title that represents the annotation. The maximum size is 255 characters. */
  title?: string;
  /** @description Details about this annotation. The maximum size is 64 KB. */
  raw_details?: string;
  /** @description The start line of the annotation. */
  start_line: number;
  /** @description The end line of the annotation. */
  end_line: number;
  /** @description The start column of the annotation. Annotations only support `start_column` and `end_column` on the same line. Omit this parameter if `start_line` and `end_line` have different values. */
  start_column?: number;
  /** @description The end column of the annotation. Annotations only support `start_column` and `end_column` on the same line. Omit this parameter if `start_line` and `end_line` have different values. */
  end_column?: number;
};

type Octokit = ReturnType<typeof getOctokit>;
type CreateResponse = Endpoints['POST /repos/{owner}/{repo}/check-runs']['response']['data'];
type UpdateResponse = Endpoints['PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}']['response']['data'];

type Variables = {
  owner: string;
  repo: string;
  sha?: string;
};
/**
 * Open a new, in-progress GitHub check run
 * @return the check ID of the created run
 */
export const startCheck = async ({
  octokit,
  owner,
  repo,
  sha,
  name,
}: Variables & {
  octokit: Octokit;
  name: string;
}): Promise<CreateResponse> => {
  try {
    info(chalk.blue('Opening check...'));
    const response = await octokit.rest.checks.create({
      owner,
      repo,
      name,
      head_sha: sha,
      started_at: new Date().toISOString(),
      status: 'in_progress',
    });

    return response.data;
  } catch (e) {
    error(chalk.red(`Failed to open check '${chalk.blue(name)}'.\n`));
    process.exit(1);
  }
};

export const updateCheck = async ({
  octokit,
  owner,
  repo,
  checkId,
  output,
}: Variables & {
  octokit: Octokit;
  checkId: number;
  output: { title: string; summary: string; annotations: Annotation[] };
}): Promise<UpdateResponse> => {
  info(chalk.blue('Updating check...'));
  const response = await octokit.rest.checks.update({
    owner,
    repo,
    output,
    check_run_id: checkId,
    status: 'in_progress',
  });
  return response.data;
};

export const closeCheck = async ({
  octokit,
  owner,
  repo,
  checkId,
  title,
  conclusion,
  text,
}: Variables & {
  octokit: Octokit;
  checkId: number;
  title: string;
  conclusion: 'success' | 'failure' | 'cancelled';
  text?: string;
}): Promise<void> => {
  info(chalk.blue('Closing check...'));
  try {
    await octokit.rest.checks.update({
      owner,
      repo,
      conclusion,
      check_run_id: checkId,
      completed_at: new Date().toISOString(),
      status: 'completed',
      output: {
        title,
        text,
        summary: `${title} concluded with status ${conclusion}`,
      },
    });
  } catch (err) {
    error(chalk.red(`Failed to close check '${chalk.blue(checkId)}'.\n`));
    throw err;
  }
};

const chunkUpdate = async ({
  octokit,
  owner,
  repo,
  checkId,
  title,
  annotations,
}: Variables & {
  octokit: Octokit;
  checkId: number;
  title: string;
  annotations: Annotation[];
}): Promise<UpdateResponse[]> => {
  const length = annotations.length;
  const chunkSize = 50;
  const chunkNumbers = Math.ceil(length / chunkSize);
  const promises = [];
  for (let chunk = 1; chunk <= chunkNumbers; chunk++) {
    const summary = `Processing ${length} annotations, chunk ${chunk} out of ${chunkNumbers}...`;
    info(chalk.blue(summary));
    const annotationChunk = annotations.splice(0, chunkSize);
    promises.push(
      updateCheck({
        octokit,
        owner,
        repo,
        checkId,
        output: {
          title,
          summary,
          annotations: annotationChunk,
        },
      }),
    );
  }

  return Promise.all(promises);
};

export const readAnnotations = (path: string): Annotation[] => {
  try {
    return JSON.parse(readFileSync(path, { encoding: 'utf-8' }));
  } catch (err) {
    error(chalk.red(`Failed to read file at path '${chalk.blue(path)}'.\n`));
    throw err;
  }
};
export const postCheck = async ({
  owner,
  repo,
  sha,
  annotations,
  token,
  name,
  conclusion,
  report,
}: Variables & {
  annotations: string;
  token: string;
  name: string;
  conclusion: 'success' | 'failure' | 'cancelled';
  report?: string;
}): Promise<void> => {
  const parsedAnnotations: Annotation[] = readAnnotations(annotations);

  const octokit = getOctokit(token);
  try {
    const open = await startCheck({ octokit, name, owner, repo, sha });
    await chunkUpdate({ octokit, checkId: open.id, title: open.name, annotations: parsedAnnotations, owner, repo });
    await closeCheck({ octokit, checkId: open.id, title: open.name, conclusion, text: report, owner, repo });
  } catch (err) {
    error(chalk.red(`Error while processing check '${chalk.blue(name)}'.\n`));
    throw err;
  }
};

export const postReport = async ({
  owner,
  repo,
  sha,
  token,
  name,
  title,
  summary,
  body,
  conclusion,
}: Variables & {
  token: string;
  name: string;
  title: string;
  summary: string;
  body: string;
  conclusion: Inputs['conclusion'];
}): Promise<void> => {
  const octokit = getOctokit(token);
  try {
    await octokit.rest.checks.create({
      owner,
      repo,
      name,
      conclusion,
      head_sha: sha,
      completed_at: new Date().toISOString(),
      status: 'completed',
      output: {
        title,
        summary,
        text: body,
      },
    });
  } catch (err) {
    error(chalk.red(`Error while processing check '${chalk.blue(name)}'.\n`));
    throw err;
  }
};
