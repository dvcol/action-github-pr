import { context, getOctokit } from '@actions/github';
import { warning, info } from '@actions/core';
import { Inputs } from './parse-inputs';
import chalk from 'chalk';

type Unwrap<T> = T extends Promise<infer U> ? U : T;
type AnyFunction = (...args: any[]) => any;
type GetResponseDataTypeFromEndpointMethod<T extends AnyFunction> = Unwrap<ReturnType<T>>['data'];

export const createUpdateComment = async ({ token, prefix, body, repo, owner, issue_number }: Inputs): Promise<void> => {
  const octokit = getOctokit(token);

  if (prefix) {
    const pages = octokit.paginate.iterator(octokit.rest.issues.listComments, {
      repo,
      owner,
      issue_number,
    });

    type Comment = GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.issues.listComments>[number];
    let comment: Comment | undefined;

    for await (const { data: comments } of pages) {
      comment = comments.find(_comment => _comment?.body?.startsWith(prefix));
      if (comment) break;
    }

    if (comment) {
      info(`Comment found ('${chalk.blue(comment?.id)}'), attempting update ...`);
      const newComment = await octokit.rest.issues.updateComment({
        ...context.repo,
        comment_id: comment.id,
        body,
      });
      info(`Comment updated: ${chalk.blue(newComment?.data?.id)}`);
      return;
    }
  }

  warning(chalk.yellow(`Comment not found, attempting create ...`));
  const newComment = await octokit.rest.issues.createComment({
    ...context.repo,
    issue_number,
    body,
  });
  info(`New comment created: ${chalk.blue(newComment?.data?.id)}`);
};
