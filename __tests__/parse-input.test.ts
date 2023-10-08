import { Inputs, Mode, parseInputs } from '../src/parse-inputs';
import * as core from '@actions/core';
import { context } from '@actions/github';
import fs from 'fs';
import { WebhookPayload } from '@actions/github/lib/interfaces';

describe('parse-input.ts', () => {
  const validInputs = {
    token: 'My Token',
    file: 'my/file/path.json',
    message: 'My custom Message',
  };

  const validInputsComment = {
    ...validInputs,
    mode: Mode.Comment,
    prefix: '<!-- custom prefix -->',
  };

  const validInputsCheck = {
    ...validInputs,
    mode: Mode.Check,
    name: 'My check name',
    title: 'My check title',
    summary: 'My check summary',
    conclusion: 'success',
  };

  const validContext = {
    repo: {
      repo: 'my-repository-name',
      owner: 'the owner',
    },
    issue: {
      number: 42,
    },
    pull_request: { head: { sha: 'my-commit-pr-sha' } },
    sha: 'my-commit-sha',
  };
  const spyReadFIle: jest.SpyInstance = jest.spyOn(fs, 'readFileSync');
  const spyGetInput: jest.SpyInstance = jest.spyOn(core, 'getInput');
  const spyGithubRepo: jest.SpyInstance = jest.spyOn(context, 'repo', 'get');
  const spyGithubIssue: jest.SpyInstance = jest.spyOn(context, 'issue', 'get');

  const mock = (
    mode: Inputs['mode'],
    options: {
      inputs?: Partial<typeof validInputs & typeof validInputsComment & typeof validInputsCheck>;
      repo?: Partial<typeof validContext.repo>;
      issue?: Partial<typeof validContext.issue>;
      sha?: string;
    } = {},
  ): void => {
    const inputs = { ...(mode === Mode.Check ? validInputsCheck : validInputsComment), ...options.inputs };
    const repo = { ...validContext.repo, ...options.repo };
    const issue = { ...validContext.issue, ...options.issue };
    spyGetInput.mockImplementation((key: keyof typeof inputs) => inputs[key]);
    spyGithubRepo.mockReturnValue(repo);
    spyGithubIssue.mockReturnValue(issue);
    context.payload.pull_request = { head: { sha: options.sha ?? validContext.pull_request.head.sha } } as unknown as WebhookPayload['pull_request'];
    context.sha = options.sha ?? validContext.sha;
  };

  afterEach(() => jest.clearAllMocks());

  it('should return inputs with message as body for mode comment', () => {
    mock(Mode.Comment);
    expect(parseInputs()).toMatchObject({
      token: validInputsComment.token,
      prefix: validInputsComment.prefix,
      body: `${validInputsComment.prefix}\n${validInputsComment.message}`,
      repo: validContext.repo.repo,
      owner: validContext.repo.owner,
      sha: validContext.pull_request.head.sha,
      issue_number: validContext.issue.number,
    });
  });

  it('should return inputs with message as body for mode check', () => {
    mock(Mode.Check);
    expect(parseInputs()).toMatchObject({
      token: validInputsCheck.token,
      name: validInputsCheck.name,
      title: validInputsCheck.title,
      summary: validInputsCheck.summary,
      conclusion: validInputsCheck.conclusion,
      body: validInputsCheck.message,
      repo: validContext.repo.repo,
      owner: validContext.repo.owner,
      sha: validContext.pull_request.head.sha,
      issue_number: validContext.issue.number,
    });
  });

  it('should return inputs with message as body and default prefix for mode comment', () => {
    const content = 'file content';
    spyReadFIle.mockReturnValue(content);
    mock(Mode.Comment, { inputs: { message: undefined } });
    expect(parseInputs()).toMatchObject({
      token: validInputs.token,
      prefix: validInputsComment.prefix,
      body: `${validInputsComment.prefix}\n${content}`,
      repo: validContext.repo.repo,
      owner: validContext.repo.owner,
      sha: validContext.pull_request.head.sha,
      issue_number: validContext.issue.number,
    });
  });

  it('should return inputs with message as body for mode check', () => {
    const content = 'file content';
    spyReadFIle.mockReturnValue(content);
    mock(Mode.Check, { inputs: { message: undefined } });
    expect(parseInputs()).toMatchObject({
      token: validInputsCheck.token,
      name: validInputsCheck.name,
      title: validInputsCheck.title,
      summary: validInputsCheck.summary,
      conclusion: validInputsCheck.conclusion,
      body: content,
      repo: validContext.repo.repo,
      owner: validContext.repo.owner,
      sha: validContext.pull_request.head.sha,
      issue_number: validContext.issue.number,
    });
  });

  it('should return inputs with message as body and default prefix for mode comment', () => {
    spyReadFIle.mockReturnValue('');
    mock(Mode.Comment, { inputs: { message: undefined } });
    expect(parseInputs).toThrow('A body is required.');
  });

  it('should throw error if neither message or file is present', () => {
    mock(Mode.Comment, { inputs: { message: undefined, file: undefined } });
    expect(parseInputs).toThrow('Either "file" or "message" is required as input.');
  });

  it('should throw error if issue number is missing', () => {
    mock(Mode.Comment, { issue: { number: undefined } });
    expect(parseInputs).toThrow('No issue/pull request in input neither in current context.');
  });

  it.each(['name', 'title', 'summary', 'conclusion'])('should throw error if %p is missing', required => {
    mock(Mode.Check, { inputs: { [required]: undefined } });
    expect(parseInputs).toThrow('Missing required input "name", "title", "summary" or "conclusion" for mode \'check\'.');
  });

  it('should throw error if conclusion is invalid', () => {
    mock(Mode.Check, { inputs: { conclusion: 'invalid' } });
    expect(parseInputs).toThrow(`Conclusion 'invalid' is not a valid value of 'success', 'failure' or 'cancelled'.`);
  });
});
