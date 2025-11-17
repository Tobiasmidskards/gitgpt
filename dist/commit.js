import { encoder, tokenLimit, getStateArgs, setCommitMessage } from './state.js';
import { consoleHeader, consoleInfo } from './logger.js';
import { addMessage, streamAssistant, getLatestMessage } from './ai.js';
import { getPreviousCommitMessages, getDiff } from './git.js';
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
    const message = getLatestMessage();
    setCommitMessage(message);
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
export async function splitBigDiff(diff) {
    const [firstHalf, secondHalf] = splitStringInHalf(diff);
    const chunks = [firstHalf, secondHalf];
    const allMessages = [];
    for (const chunk of chunks) {
        const previousCommitMessages = await getPreviousCommitMessages();
        const prompt = buildCommitMessagePrompt(chunk, previousCommitMessages);
        const result = await streamAssistant(false, [{ role: 'user', content: prompt }]);
        allMessages.push(result);
    }
    const message = allMessages.join('');
    const rules = `
      Commit Message Rules:
      1. Use the imperative mood ("Add" instead of "Adds" or "Added").
      2. Start with a capital letter.
      3. Do not end with a period.
      4. Summarize the change, not the reason for it.
      5. Keep it concise, max 50 characters.
      6. Make it clear and descriptive.
      7. English only.
      8. Single-line format.
      9. Do NOT try to format it like code / include \`\`\` in the message.
      
      Example: git commit -m "Add login feature"
      
      Combine the following messages into one commit message: 
    `;
    const messagePayload = rules + '\n\n' + message;
    const result = await streamAssistant(false, [{ role: 'user', content: messagePayload }]);
    addMessage(messagePayload);
    addMessage(result, 'assistant');
}
export function splitStringInHalf(str) {
    const index = Math.ceil(str.length / 2);
    return [str.substring(0, index), str.substring(index)];
}
export function buildCommitMessagePrompt(diff, previousCommitMessages = '') {
    const analysis = analyzeChangedFiles(diff);
    const conventionalPrefix = generateConventionalCommitPrefix(analysis);
    const rules = `
      Commit Message Rules:
      1. Use the imperative mood ("Add" instead of "Adds" or "Added").
      2. Start with a capital letter.
      3. Do not end with a period.
      4. Focus on the "what" and "why", not the "how".
      5. Keep it concise, max 50 characters.
      6. Make it clear and descriptive.
      7. English only.
      8. Use "and" if the commit does multiple things.
      9. Do NOT try to format it like code; Do not include \`\`\` in the message.
      10. Use conventional commit format: ${conventionalPrefix}: message (DO NOT include scope in parentheses, only use the type prefix)
      11. Never include scope information like (dist,src) or (auth) in the commit message
      
      Example answer: git commit -m "feat: Add API endpoint for user login and registration form"
    `;
    const contextInfo = `
      Change Analysis:
      - File types affected: ${analysis.fileTypes.join(', ') || 'unknown'}
      - Change type detected: ${analysis.changeTypes.join(', ') || 'general'}
      - Suggested conventional prefix: ${conventionalPrefix}
    `;
    const additionalInfo = `
      In the diff, + indicates an added line, - indicates a removed line.
      Respond only in this format: git commit -m "Commit message". Lowercase commands only.
    `;
    let hintInfo = '';
    const args = getStateArgs();
    if (args['--hint']) {
        hintInfo = `
      The user provided this hint for the commit message. Please incorporate it into your message: "${args['--hint']}"
        `;
    }
    let prompt = `
      The diff comes from this command: git --no-pager diff -U25 --cached --stat --line-prefix '$ ' -- ':!package-lock.json' ':!composer.lock'
      Each line starts with $ .
      ----
      ${contextInfo}
      ----
      ${rules}
      ----
      ${additionalInfo}
      ----
      ${hintInfo}
      ----
      Here are the previous commit messages for consistency:
      ${previousCommitMessages}
      ----
      Diff is:
    `;
    prompt = prompt.replace(/ {2,}/g, ' ') + diff;
    return prompt;
}
export function analyzeChangedFiles(diff) {
    const lines = diff.split('\n');
    const fileTypes = new Set();
    const scopes = new Set();
    const changeTypes = new Set();
    let currentFile = '';
    let addedLines = 0;
    let removedLines = 0;
    for (const line of lines) {
        if (line.startsWith('$ diff --git')) {
            const match = line.match(/b\/(.+)$/);
            if (match) {
                currentFile = match[1];
                const ext = currentFile.split('.').pop()?.toLowerCase();
                if (ext)
                    fileTypes.add(ext);
                const pathParts = currentFile.split('/');
                if (pathParts.length > 1)
                    scopes.add(pathParts[0]);
            }
        }
        if (line.startsWith('$ +') && !line.startsWith('$ +++')) {
            addedLines++;
        }
        else if (line.startsWith('$ -') && !line.startsWith('$ ---')) {
            removedLines++;
        }
        if (line.includes('function ') || line.includes('const ') || line.includes('class ')) {
            if (line.startsWith('$ +'))
                changeTypes.add('feat');
            else if (line.startsWith('$ -'))
                changeTypes.add('refactor');
        }
        if (currentFile.includes('test') || currentFile.includes('spec'))
            changeTypes.add('test');
        if (currentFile.endsWith('.md') || currentFile.includes('README') || currentFile.includes('doc'))
            changeTypes.add('docs');
        if (currentFile.includes('config') ||
            currentFile.endsWith('.json') ||
            currentFile.endsWith('.yml') ||
            currentFile.endsWith('.yaml'))
            changeTypes.add('chore');
        if (line.toLowerCase().includes('fix') || line.toLowerCase().includes('bug') || line.toLowerCase().includes('error'))
            changeTypes.add('fix');
    }
    if (changeTypes.size === 0) {
        if (addedLines > removedLines * 2)
            changeTypes.add('feat');
        else if (removedLines > addedLines * 2)
            changeTypes.add('refactor');
        else
            changeTypes.add('chore');
    }
    return {
        fileTypes: Array.from(fileTypes),
        scopes: Array.from(scopes),
        changeTypes: Array.from(changeTypes),
    };
}
export function generateConventionalCommitPrefix(analysis) {
    const primaryType = analysis.changeTypes[0] || 'chore';
    return primaryType;
}
