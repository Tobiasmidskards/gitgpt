const conventionalCommitPattern = /^(feat|fix|docs|style|refactor|test|chore): ([^\r\n"]+)$/;
const branchNamePattern = /^(feature|chore|bug|hotfix)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function parseCommitCommand(output: string): string | null {
  const match = output.trim().match(/^git commit -m "([^"\r\n]+)"$/);
  const message = match?.[1];

  if (!message || !validateCommitMessage(message).isValid) {
    return null;
  }

  return message;
}

export function parseBranchName(output: string): string | null {
  const branchName = output.trim();
  const match = branchName.match(branchNamePattern);

  if (!match || match[2].length > 30) {
    return null;
  }

  return branchName;
}

export function validateCommitMessage(message: string): { isValid: boolean; suggestions: string[] } {
  const suggestions: string[] = [];
  const commandMatch = message.trim().match(/^git commit -m "([^"\r\n]+)"$/);
  const actualMessage = commandMatch?.[1] ?? message.trim();
  const formatMatch = actualMessage.match(conventionalCommitPattern);
  const description = formatMatch?.[2] ?? '';

  if (!formatMatch) {
    suggestions.push('Use the format "<type>: <Description>" with a supported conventional commit type');
  }

  if (actualMessage.length > 50) {
    suggestions.push('Consider shortening the message to 50 characters or less');
  }

  const firstWord = description.split(/\s+/)[0]?.toLowerCase() || '';
  const nonImperativeWords = ['adds', 'added', 'fixes', 'fixed', 'updates', 'updated', 'changes', 'changed'];
  if (nonImperativeWords.includes(firstWord)) {
    suggestions.push('Use imperative mood ("Add" instead of "Adds" or "Added")');
  }

  const vagueTerms = ['stuff', 'things', 'some', 'various', 'misc'];
  if (vagueTerms.some((term) => description.toLowerCase().split(/\W+/).includes(term))) {
    suggestions.push('Be more specific instead of using vague terms');
  }

  if (description[0] && description[0] !== description[0].toUpperCase()) {
    suggestions.push('Capitalize the description after the type prefix');
  }

  if (actualMessage.endsWith('.')) {
    suggestions.push('Remove the ending period');
  }

  return { isValid: suggestions.length === 0, suggestions };
}
