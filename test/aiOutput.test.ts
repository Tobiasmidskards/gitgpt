import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBranchName, parseCommitCommand, validateCommitMessage } from '../src/aiOutput.js';

test('extracts a valid conventional commit message', () => {
  assert.equal(parseCommitCommand('git commit -m "feat: Add safer git execution"'), 'feat: Add safer git execution');
});

test('rejects shell content appended to a commit command', () => {
  assert.equal(parseCommitCommand('git commit -m "feat: Add feature"; touch /tmp/injected'), null);
});

test('rejects commit messages outside the required format', () => {
  assert.equal(parseCommitCommand('Here is your commit: git commit -m "feat: Add feature"'), null);
  assert.equal(parseCommitCommand('git commit -m "feat: add feature"'), null);
  assert.equal(parseCommitCommand('git commit -m "feat: Add feature."'), null);
});

test('validates the description rather than the type prefix', () => {
  assert.deepEqual(validateCommitMessage('git commit -m "feat: Add feature"'), {
    isValid: true,
    suggestions: [],
  });

  const invalid = validateCommitMessage('git commit -m "feat: Added feature"');
  assert.equal(invalid.isValid, false);
  assert.match(invalid.suggestions.join(' '), /imperative/i);
});

test('accepts valid branch names', () => {
  assert.equal(parseBranchName('feature/safer-git-execution\n'), 'feature/safer-git-execution');
});

test('rejects unsafe or malformed branch names', () => {
  assert.equal(parseBranchName('feature/safe;touch-pwned'), null);
  assert.equal(parseBranchName('Feature/not-lowercase'), null);
  assert.equal(parseBranchName(`feature/${'a'.repeat(31)}`), null);
});
