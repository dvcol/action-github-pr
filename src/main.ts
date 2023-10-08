import { Mode, parseInputs } from './parse-inputs';
import { createUpdateComment } from './create-update-comment';
import { debug, setFailed } from '@actions/core';
import { postCheck, postReport } from './post-check';
import * as process from 'process';

export const run = async (): Promise<void> => {
  // To force color output, see https://github.com/chalk/supports-color/issues/106env:
  process.env.FORCE_COLOR = '2';

  try {
    const inputs = parseInputs();
    if (inputs.mode === Mode.Comment) {
      await createUpdateComment(inputs);
    } else if (inputs.mode === Mode.Check && inputs.annotations) {
      await postCheck(inputs);
    } else if (inputs.mode === Mode.Check) {
      await postReport(inputs);
    } else {
      setFailed(`Mode '${inputs.mode}' is not supported.`);
    }
    debug('Github pr comment action ran successfully');
  } catch (err) {
    debug('Github pr comment encountered an error');
    if (err instanceof Error) {
      setFailed(err.message);
    }
  }
};

run();
