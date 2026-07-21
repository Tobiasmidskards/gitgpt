import clipboardy from 'clipboardy';
import { encoder, tokenLimit, getStateArgs, setCommitMessage } from './state.js';
import { consoleHeader, consoleInfo } from './logger.js';
import { addMessage, streamAssistant, getLatestMessage } from './ai.js';
import { getPreviousCommitMessages, getDiff } from './git.js';
import { askQuestion } from './readlineUtils.js';
import { isVerbose } from './state.js';
import { validateCommitMessage } from './aiOutput.js';

export { validateCommitMessage } from './aiOutput.js';

export async function executeGetCommitMessageFlow() {
  const diff = await getDiff();
  // If diff equals default message, we consider no staged changes
  if (!diff || diff.trim() === '' || diff.trim() === 'No changes to commit') {
    consoleInfo('No files to commit: <executeGetCommitMessageFlow>');
    return;
  }

  consoleHeader('COMMIT');
  await prepareCommitMessagePrompt();
  await streamAssistant();
  copyLastMessageToClipboard();

  let message = getLatestMessage();
  setCommitMessage(message);

  const args = getStateArgs();
  const validation = validateCommitMessage(message);
  if (!validation.isValid) {
    if (isVerbose()) {
      console.log('⚠️  Commit message could be improved:');
      validation.suggestions.forEach((suggestion) => {
        console.log(`   • ${suggestion}`);
      });
    }

    if (args['--interactive'] || args['-i']) {
      const shouldRegenerate = await askQuestion('Would you like to regenerate the commit message? (y/n): ');
      if (shouldRegenerate.toLowerCase() === 'y' || shouldRegenerate.toLowerCase() === 'yes') {
        const improvements = validation.suggestions.join('; ');
        // Update args in state so prepareCommitMessagePrompt picks up the hint.
        args['--hint'] = `Please improve the message by: ${improvements}`;
        await prepareCommitMessagePrompt();
        await streamAssistant();
        copyLastMessageToClipboard();
        message = getLatestMessage();
        setCommitMessage(message);
      }
    }
  } else if (validation.isValid && isVerbose()) {
    console.log('✅ Commit message looks good!');
  }
}

// getLatestMessage imported directly to avoid dynamic require in ESM

export async function prepareCommitMessagePrompt() {
  const diff = await getDiff();

  if (encoder.encode(diff).length > tokenLimit) {
    consoleInfo('Diff is too big, splitting into two chunks', 1, 1, true);
    await splitBigDiff(diff);
    return;
  }

  consoleInfo('Diff is: ' + diff, 1, 1, true);
  const previousCommitMessages = await getPreviousCommitMessages();
  const commitPrompt = buildCommitMessagePrompt(diff, previousCommitMessages);
  addMessage(commitPrompt);
}

export async function splitBigDiff(diff: string) {
  const [firstHalf, secondHalf] = splitStringInHalf(diff);
  const chunks = [firstHalf, secondHalf];
  const allMessages: string[] = [];

  for (const chunk of chunks) {
    const previousCommitMessages = await getPreviousCommitMessages();
    const prompt = buildCommitMessagePrompt(chunk, previousCommitMessages);
    const result = await streamAssistant(false, [{ role: 'user', content: prompt }]);
    allMessages.push(result);
  }

  const message = allMessages.join('');
  const combinePrompt = `Combine these partial commit messages into ONE final commit message:

${message}

## Rules
1. Format: \`git commit -m "<type>: <Description>"\`
2. Use conventional commit types: feat, fix, docs, style, refactor, test, chore
3. Imperative mood: "Add" not "Added"
4. Capitalize after the type prefix, no period at end
5. Max 50 characters total
6. Summarize the overall intent of all changes
7. English only, no markdown

Respond with ONLY the git commit command.`;

  const messagePayload = combinePrompt;
  const result = await streamAssistant(false, [{ role: 'user', content: messagePayload }]);
  addMessage(messagePayload);
  addMessage(result, 'assistant');
}

export function splitStringInHalf(str: string): [string, string] {
  const index = Math.ceil(str.length / 2);
  return [str.substring(0, index), str.substring(index)];
}

export function buildCommitMessagePrompt(diff: string, previousCommitMessages: string = '') {
  const analysis = analyzeChangedFiles(diff);
  const conventionalPrefix = generateConventionalCommitPrefix(analysis);

  const args = getStateArgs();
  const userHint = args['--hint'] ? `\nUser hint: "${args['--hint']}" — incorporate this into your message.` : '';

  const prompt = `Generate a commit message for the following git diff.

## Diff Format
Lines starting with "$ +" are additions, "$ -" are deletions.

## Commit Type
Based on the changes, use type: ${conventionalPrefix}
(File types: ${analysis.fileTypes.join(', ') || 'mixed'} | Detected: ${analysis.changeTypes.join(', ') || 'general'})

## Rules
1. Format: \`git commit -m "<type>: <Description>"\`
2. Use conventional commit types: feat, fix, docs, style, refactor, test, chore
3. Imperative mood: "Add" not "Added" or "Adds"
4. Capitalize the first letter after the type prefix
5. No period at the end
6. Max 50 characters total (type + message)
7. Describe WHAT changed and WHY it matters, not HOW
8. Be specific — avoid vague words like "update", "fix things", "changes"
9. If multiple changes, summarize the primary intent
10. English only, no markdown formatting${userHint}

## Good Examples
- git commit -m "feat: Add user authentication flow"
- git commit -m "fix: Prevent crash on empty input"
- git commit -m "refactor: Extract validation logic"
- git commit -m "docs: Update API usage examples"

## Bad Examples (avoid these patterns)
- "Update files" (too vague)
- "Fix bug" (which bug?)
- "feat(auth): Add login" (no scopes in parentheses)
- "Added new feature" (not imperative)

## Recent Commits (match this style)
${previousCommitMessages || 'No recent commits available'}

## Diff
${diff}

Respond with ONLY the git commit command, nothing else.`;

  return prompt;
}

export function analyzeChangedFiles(diff: string): { fileTypes: string[]; scopes: string[]; changeTypes: string[] } {
  const lines = diff.split('\n');
  const fileTypes = new Set<string>();
  const scopes = new Set<string>();
  const changeTypes = new Set<string>();

  let currentFile = '';
  let addedLines = 0;
  let removedLines = 0;

  for (const line of lines) {
    if (line.startsWith('$ diff --git')) {
      const match = line.match(/b\/(.+)$/);
      if (match) {
        currentFile = match[1];
        const ext = currentFile.split('.').pop()?.toLowerCase();
        if (ext) fileTypes.add(ext);
        const pathParts = currentFile.split('/');
        if (pathParts.length > 1) scopes.add(pathParts[0]);
      }
    }
    if (line.startsWith('$ +') && !line.startsWith('$ +++')) {
      addedLines++;
    } else if (line.startsWith('$ -') && !line.startsWith('$ ---')) {
      removedLines++;
    }
    if (line.includes('function ') || line.includes('const ') || line.includes('class ')) {
      if (line.startsWith('$ +')) changeTypes.add('feat');
      else if (line.startsWith('$ -')) changeTypes.add('refactor');
    }
    if (currentFile.includes('test') || currentFile.includes('spec')) changeTypes.add('test');
    if (currentFile.endsWith('.md') || currentFile.includes('README') || currentFile.includes('doc')) changeTypes.add('docs');
    if (
      currentFile.includes('config') ||
      currentFile.endsWith('.json') ||
      currentFile.endsWith('.yml') ||
      currentFile.endsWith('.yaml')
    )
      changeTypes.add('chore');
    if (line.toLowerCase().includes('fix') || line.toLowerCase().includes('bug') || line.toLowerCase().includes('error'))
      changeTypes.add('fix');
  }

  if (changeTypes.size === 0) {
    if (addedLines > removedLines * 2) changeTypes.add('feat');
    else if (removedLines > addedLines * 2) changeTypes.add('refactor');
    else changeTypes.add('chore');
  }

  return {
    fileTypes: Array.from(fileTypes),
    scopes: Array.from(scopes),
    changeTypes: Array.from(changeTypes),
  };
}

export function generateConventionalCommitPrefix(analysis: { fileTypes: string[]; scopes: string[]; changeTypes: string[] }): string {
  const primaryType = analysis.changeTypes[0] || 'chore';
  return primaryType;
}

function copyLastMessageToClipboard() {
  try {
    clipboardy.writeSync(getLatestMessage());
  } catch {
    console.error('Could not copy to clipboard');
  }
}

