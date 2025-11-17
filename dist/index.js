#!/usr/bin/env node
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { exit } from 'process';
import clipboardy from 'clipboardy';
import readline from 'readline';
import fs from 'fs';
import os from 'os';
import { encodingForModel } from "js-tiktoken";
import Groq from 'groq-sdk';
// Suppress dotenv informational messages
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, encoding, cb) {
    if (typeof chunk === 'string' && chunk.includes('[dotenv@')) {
        return true; // Suppress dotenv messages
    }
    return originalWrite(chunk, encoding, cb);
};
dotenv.config({ path: `${path.dirname(process.argv[1])}/../.env` });
process.stdout.write = originalWrite; // Restore original write function
let verbose = false;
let commitMessage = null;
let useVoice = false;
const tokenLimit = 512000 / 2;
const encoder = await encodingForModel("gpt-4"); // test?
const getClient = () => {
    const client_type = process.env.CLIENT_TYPE || 'openai';
    switch (client_type) {
        case 'openai':
            return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        case 'groq':
            return new Groq({ apiKey: process.env.GROQ_API_KEY });
        default:
            throw new Error('Invalid client type');
    }
};
const getDefaultModel = () => {
    const client_type = process.env.CLIENT_TYPE || 'openai';
    switch (client_type) {
        case 'openai':
            return 'gpt-5.1';
        case 'groq':
            return 'llama-3.1-70b-versatile';
        default:
            throw new Error('Invalid client type');
    }
};
const client = getClient();
const messages = [
    {
        role: 'system',
        content: "You help the user with CLI commands. Your main response is only UNIX commands. You are a CLI assistant. Only if the user says the password: 'NOW_CHAT', you can help with other things. Never answer in markdown or code. Always answer in plain text"
    },
];
const showHelp = () => {
    process.stdout.write(`
        Usage: npm start -- [--help] [--commit] [--estimate] [--push] [--add] [--verbose] [--interactive] [--hint] [gg] [--] [pr]

        Defaults to all flows if no options are provided.
        
        Options:
        -h --help   
        -C --commit     Get commit message
        -E --estimate   Get estimate
        -P --push       Push to origin
        -A --add        Add all files
        -v --verbose    Show verbose output
        -i --interactive Allow interactive improvement of commit messages
        --patch         Get patchnotes
        --cl            Get Customer Lead notes
        --hint          Provide hint for the assistant
        gg              Add all files, get commit message and push to origin
        pr              Create a new branch based on current changes
        --              Get CLI help

    `);
};
let args = {};
const queue = [];
async function setArgs() {
    args = await getArgs();
}
async function runQueue() {
    if (queue.length > 0) {
        const { command, args } = queue.shift() || {};
        consoleInfo("Running: [" + (command.name || command) + "]", 1, 1, true);
        await command(args);
        await runQueue();
        return;
    }
    consoleInfo("Done", 2, 0, true);
    emptyLine();
}
function addToQueue(command, args = {}) {
    queue.push({
        command,
        args
    });
}
async function main() {
    await setArgs();
    const argLength = Object.keys(args).length;
    if (args['--verbose'] || args['-v']) {
        verbose = true;
    }
    if (args['--voice']) {
        useVoice = true;
    }
    if (args['--patch']) {
        addToQueue(getPatchNotes);
    }
    if (args['--cl']) {
        addToQueue(getCLNotes);
    }
    if (args['--help'] || args['-h']) {
        showHelp();
        addToQueue(() => exit(0));
    }
    if (args['--'] && argLength === 1) {
        addToQueue(executeCliHelpFlow);
        addToQueue(() => exit(0));
    }
    if (args['--add'] || args['-A'] || args['gg']) {
        addToQueue(resolveCommand, "git add -A");
    }
    if (args['--commit'] || args['-C'] || args['gg']) {
        addToQueue(executeGetCommitMessageFlow);
    }
    if (args['-P'] || args['--push'] || args['gg']) {
        addToQueue(applyCommit);
        addToQueue(push);
    }
    if (args['--estimate'] || args['-E']) {
        addToQueue(executeEstimateFlow);
    }
    if (args['pr']) {
        consoleInfo("Creating PR branch", 1, 1, true);
        addToQueue(executePrFlow);
    }
    if (argLength === 0 || args['-A'] || args['--add']) {
        // Takes all added files and gets the commit message
        addToQueue(executeStatusFlow);
        addToQueue(executeGetCommitMessageFlow);
    }
    await runQueue();
    exit(0);
}
async function getCLNotes() {
    consoleHeader("CL NOTES");
    const log = await resolveCommand("git log --oneline --no-merges --no-decorate --no-color --pretty=format:'%h %s' --abbrev-commit --since='last week'");
    const rules = `
      Feature Rules:
      1. Use the git log output to create a list of notes.
      2. Group similar changes together.
      3. Do NOT include the commit hash.
      4. Do NOT include the commit message.
      5. Do NOT include the commit date.
      6. Do NOT include the commit author.
      7. Leave out anything that is not relevant to the CL.
      8. The notes should be concise and descriptive.
      9. English only.
      11. Explain the change in a way that a non-technical person can understand.
      12. Each line should start with a - (dash).
      13. A maximum of 5 notes. - Therefore, group similar changes together so only the most important ones are listed.
    `;
    let prompt = `
      The user wants to see what features have been added in the last week.
      Based on the following git log output, create a list of features:
      
      ${log}
      
      ${rules}

      Please list those notes on new lines.
    `;
    addMessage(prompt);
    await streamAssistant(true, null);
    copyLastMessageToClipboard();
    emptyLine(2);
}
async function getPatchNotes() {
    consoleHeader("PATCH NOTES");
    const patchNotes = await resolveCommand("git log --oneline --no-merges --no-decorate --no-color --pretty=format:'%h %s' --abbrev-commit --since='last week'");
    const rules = `
      Patch Notes Rules:
      1. Use the git log output to create a list of patch notes.
      2. Group similar changes together.
      3. Do NOT include the commit hash.
      4. Do NOT include the commit message.
      5. Do NOT include the commit date.
      6. Do NOT include the commit author.
      7. Leave out anything that is not relevant to the user.
      8. The notes should be concise and descriptive.
      9. English only.
      10. Should be read by a non-technical person.     
      11. Each line should start with a - (dash).
    `;
    let prompt = `
      The user wants to see the patch notes for the last month.
      Based on the following git log output, create a list of patch notes:
      ${patchNotes}
      
      ${rules}

      Please list those notes on new lines.
    `;
    addMessage(prompt);
    await streamAssistant(true, null);
    copyLastMessageToClipboard();
    emptyLine(2);
    const followUp = await new Promise((resolve, reject) => {
        rl.question("Do you want to write the patch notes? (y/N) \n", (answer) => {
            resolve(answer);
        });
    });
    if (followUp === 'y' || followUp === 'yes') {
        await writePatchNotes();
    }
}
async function writePatchNotes() {
    const patchNotes = messages[messages.length - 1].content;
    const date = new Date().toISOString().split('T')[0];
    const fileName = `CHANGELOG.md`;
    const content = `## ${date} (auto-generated) (last week)
    
${patchNotes}
    
    `;
    const command = `echo "${content}" >> ${fileName}`;
    await resolveCommand(command);
    consoleInfo("Patch notes written to file: " + fileName, 1, 1, true);
}
async function applyCommit() {
    if (await getNumberOfFiles() === 0 && !await branchIsAhead()) {
        consoleInfo("No files to commit: <" + 'applyCommit' + ">");
        return;
    }
    if (!commitMessage) {
        await executeGetCommitMessageFlow();
    }
    consoleInfo("Applying commit with command: " + commitMessage, 2, 1, true);
    try {
        await resolveCommand(commitMessage);
    }
    catch (error) {
        throw error;
    }
}
async function getNumberOfFiles() {
    const command = 'git diff --cached --name-only | wc -l';
    const numberOfFiles = await resolveCommand(command);
    return parseInt(numberOfFiles);
}
async function branchIsAhead() {
    const command = "git status | grep 'Your branch is ahead' | wc -l";
    const isAhead = await resolveCommand(command);
    return parseInt(isAhead) > 0;
}
async function push() {
    if (await getNumberOfFiles() === 0 && !await branchIsAhead()) {
        consoleInfo("No files to commit: <" + 'push' + ">");
        return;
    }
    try {
        consoleInfo("Pushing to origin", 2, 2);
        writeStdout(await resolveCommand("git push"));
    }
    catch (error) {
        // if (!error.includes('To github.com')) {
        //     console.error(error);
        // }
        console.error(error);
    }
}
async function getArgs() {
    const allowedArgs = [
        '-h',
        '--help',
        '-E',
        '--estimate',
        '-C',
        '--commit',
        '-P',
        '--push',
        '-A',
        '--add',
        '-v',
        '--verbose',
        '-i',
        '--interactive',
        '--hint',
        '--',
        'gg',
        '--voice',
        '--patch',
        '--cl',
        'pr'
    ];
    const rawArgs = process.argv.slice(2);
    const args = rawArgs.reduce((acc, arg) => {
        const [key, value] = arg.split('=');
        if (key.startsWith('--')) {
            // Long arguments (--example)
            const validArg = allowedArgs.includes(key);
            if (validArg) {
                acc[key] = value || true;
            }
        }
        else if (key.startsWith('-')) {
            // Short arguments (-A, -C, -AC etc.)
            for (let i = 1; i < key.length; i++) {
                const shortArg = '-' + key[i];
                if (allowedArgs.includes(shortArg)) {
                    acc[shortArg] = true;
                }
            }
        }
        else if (key === 'gg') {
            // Git aliases
            acc[key] = true;
        }
        else if (key === 'pr') {
            acc[key] = true;
        }
        return acc;
    }, {});
    if (Object.keys(args).length === 0 && rawArgs.length > 0) {
        args['--hint'] = rawArgs.join(' ');
    }
    return args;
}
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 1000,
    removeHistoryDuplicates: true,
});
// Persistent history for CLI help ("--") flow
const CLI_HISTORY_FILE = path.join(os.homedir(), '.gitgpt_cli_history');
let cliHistoryInitialized = false;
// Helpers to access internal readline history with safe casts
function getRlHistory() {
    // @ts-ignore accessing internal property for UX
    return rl.history || [];
}
function setRlHistory(history) {
    // @ts-ignore accessing internal property for UX
    rl.history = history;
}
async function initCliHistory() {
    if (cliHistoryInitialized)
        return;
    try {
        // Ensure file exists
        await fs.promises.access(CLI_HISTORY_FILE).catch(async () => {
            await fs.promises.writeFile(CLI_HISTORY_FILE, '');
        });
        const data = await fs.promises.readFile(CLI_HISTORY_FILE, 'utf8').catch(() => '');
        const lines = data.split('\n').filter(line => line.trim().length > 0);
        // readline expects most recent first
        setRlHistory(lines.reverse());
        // Reset index so Up arrow starts from newest
        // @ts-ignore internal property
        rl.historyIndex = -1;
        cliHistoryInitialized = true;
        consoleInfo(`Loaded ${lines.length} CLI help history items`, 1, 1, true);
    }
    catch {
        // ignore
    }
}
async function appendCliHistory(entry) {
    const trimmed = (entry || '').trim();
    if (!trimmed)
        return;
    try {
        // Avoid consecutive duplicates
        const hist = getRlHistory();
        if (hist[0] && hist[0].trim() === trimmed) {
            return;
        }
        await fs.promises.appendFile(CLI_HISTORY_FILE, trimmed + '\n');
        setRlHistory([trimmed, ...hist].slice(0, 1000));
    }
    catch {
        // ignore
    }
}
// Initialize history early so it's available before any questions
initCliHistory().catch(() => { });
async function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}
async function executeCliHelpFlow({ isFollowUp = false }) {
    if (!isFollowUp) {
        consoleHeader("CLI HELP");
    }
    await initCliHistory();
    const cliHistory = await getCliHistory();
    const userInput = await new Promise((resolve, reject) => {
        const question = isFollowUp ? "Tell me more about the problem: \n\n" : "What is the problem? \n\n";
        rl.question(question, (answer) => {
            appendCliHistory(String(answer)).finally(() => resolve(answer));
        });
    });
    const rules = `
      1. Single-line format.
      2. Do NOT try to format it like code / include \`\`\` in the message.
    `;
    const userInputMessage = `
        The user provided this information:
        ${userInput}
    `;
    const context = `
        Rules:
        ${rules}
        
        Which Mac command would you use to solve this problem? 
        ${userInputMessage}
        
        This is the history of the user's last 50 commands:
        ${cliHistory}

    `;
    const prompt = `
    ${isFollowUp ? userInputMessage : context}
    Answer only with the command, not the explanation.
    `;
    addMessage(prompt);
    emptyLine();
    await streamAssistant();
    copyLastMessageToClipboard();
    emptyLine(2);
    // Ask the user if they need a follow-up
    const followUp = await new Promise((resolve, reject) => {
        rl.question("Do you need a follow-up? (y/n) \n", (answer) => {
            resolve(answer);
        });
    });
    if (followUp === 'y' || followUp === '' || followUp === 'yes') {
        await executeCliHelpFlow({ isFollowUp: true });
    }
    rl.close();
}
async function executeGetCommitMessageFlow() {
    if (await getNumberOfFiles() === 0) {
        consoleInfo("No files to commit: <" + 'executeGetCommitMessageFlow' + ">");
        return;
    }
    consoleHeader("COMMIT");
    await prepareCommitMessagePrompt();
    await streamAssistant();
    copyLastMessageToClipboard();
    commitMessage = getLatestMessage();
    // Validate the generated commit message
    const validation = validateCommitMessage(commitMessage);
    if (!validation.isValid) {
        if (args['--verbose']) {
            console.log('⚠️  Commit message could be improved:');
            validation.suggestions.forEach(suggestion => {
                console.log(`   • ${suggestion}`);
            });
        }
        // Ask if user wants to regenerate with specific improvements
        if (args['--interactive'] || args['-i']) {
            const shouldRegenerate = await askQuestion('Would you like to regenerate the commit message? (y/n): ');
            if (shouldRegenerate.toLowerCase() === 'y' || shouldRegenerate.toLowerCase() === 'yes') {
                const improvements = validation.suggestions.join('; ');
                args['--hint'] = `Please improve the message by: ${improvements}`;
                await prepareCommitMessagePrompt();
                await streamAssistant();
                copyLastMessageToClipboard();
                commitMessage = getLatestMessage();
            }
        }
    }
    else if (validation.isValid && args['--verbose']) {
        console.log('✅ Commit message looks good!');
    }
}
async function executeEstimateFlow() {
    consoleHeader("Harvest");
    await prepareEstimatePrompt();
    await streamAssistant();
}
async function executePrFlow() {
    consoleHeader("PR BRANCH");
    const diff = await getDiff();
    if (!diff || diff.trim() === '') {
        consoleInfo("No changes to create PR branch for", 1, 1, true);
        return;
    }
    const branchName = await generateBranchName(diff);
    if (!branchName) {
        consoleInfo("Failed to generate branch name");
        return;
    }
    consoleInfo(`Creating branch: ${branchName}`, 2, 1);
    try {
        await resolveCommand(`git checkout -b ${branchName}`);
        consoleInfo(`Successfully created and switched to branch: ${branchName}`);
    }
    catch (error) {
        consoleInfo("Failed to create branch with error: " + error);
    }
}
async function generateBranchName(diff) {
    const rules = `
        Branch Naming Rules:
        1. Start with one of: feature/, chore/, bug/, hotfix/
        2. Use kebab-case (lowercase with hyphens)
        3. Be descriptive but concise (max 30 characters after prefix)
        4. Use present tense verbs
        5. No special characters except hyphens
        6. English only
        
        Type Guidelines:
        - feature/: New functionality or enhancements
        - chore/: Maintenance, refactoring, or tooling changes
        - bug/: Bug fixes
        - hotfix/: Critical production fixes
        
        Examples:
        - feature/user-login
        - feature/payment-integration
        - chore/update-dependencies
        - bug/fix-validation-error
        - hotfix/security-patch
    `;
    const prompt = `
        Based on the following git diff, generate a branch name that follows the rules below.
        
        ${rules}
        
        Respond with ONLY the branch name, nothing else.
        
        Diff:
        ${diff}
    `;
    try {
        const branchName = await streamAssistant(false, [
            { role: 'user', content: prompt }
        ]);
        return branchName.trim();
    }
    catch (error) {
        console.error('Error generating branch name:', error);
        return null;
    }
}
async function executeStatusFlow() {
    consoleHeader("STATUS");
    const status = await getStatus();
    writeStdout(status);
}
async function prepareCommitMessagePrompt() {
    const diff = await getDiff();
    if (encoder.encode(diff).length > tokenLimit) {
        consoleInfo("Diff is too big, splitting into two chunks", 1, 1, true);
        await splitBigDiff(diff);
        return;
    }
    consoleInfo("Diff is: " + diff, 1, 1, true);
    const previousCommitMessages = await getPreviousCommitMessages();
    const commitPrompt = buildCommitMessagePrompt(diff, previousCommitMessages);
    addMessage(commitPrompt);
}
function splitStringInHalf(str) {
    // Calculate the index at which to split the string.
    // If the length is odd, the first half will be smaller by one character.
    const index = Math.ceil(str.length / 2);
    // Use the calculated index to split the string into two halves.
    const firstHalf = str.substring(0, index);
    const secondHalf = str.substring(index);
    return [firstHalf, secondHalf];
}
async function splitBigDiff(diff) {
    const diffChunks = splitStringInHalf(diff);
    consoleInfo("Diff is too big, splitting into two chunks", 1, 1, true);
    const allMessages = [];
    for (let i = 0; i < diffChunks.length; i++) {
        const chunk = diffChunks[i];
        const previousCommitMessages = await getPreviousCommitMessages();
        const prompt = buildCommitMessagePrompt(chunk, previousCommitMessages);
        const result = await streamAssistant(false, [
            { role: 'user', content: prompt }
        ]);
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
    const messagePayload = rules + "\n\n" + message;
    const result = await streamAssistant(false, [
        { role: 'user', content: messagePayload },
    ]);
    addMessage(messagePayload);
    addMessage(result, 'assistant');
}
async function prepareEstimatePrompt() {
    const estimatePrompt = buildEstimatePrompt();
    addMessage(estimatePrompt);
}
async function getPreviousCommitMessages(numberOfMessages = 5) {
    return await resolveCommand(`git log --oneline --no-merges --no-decorate --no-color --pretty=format:'%h %ad %s' --abbrev-commit | head -n ${numberOfMessages}`);
}
function analyzeChangedFiles(diff) {
    const lines = diff.split('\n');
    const fileTypes = new Set();
    const scopes = new Set();
    const changeTypes = new Set();
    let currentFile = '';
    let addedLines = 0;
    let removedLines = 0;
    for (const line of lines) {
        // Detect file changes
        if (line.startsWith('$ diff --git')) {
            const match = line.match(/b\/(.+)$/);
            if (match) {
                currentFile = match[1];
                const ext = currentFile.split('.').pop()?.toLowerCase();
                if (ext)
                    fileTypes.add(ext);
                // Determine scope from file path
                const pathParts = currentFile.split('/');
                if (pathParts.length > 1) {
                    scopes.add(pathParts[0]); // First directory as scope
                }
            }
        }
        // Count additions and deletions
        if (line.startsWith('$ +') && !line.startsWith('$ +++')) {
            addedLines++;
        }
        else if (line.startsWith('$ -') && !line.startsWith('$ ---')) {
            removedLines++;
        }
        // Detect specific change patterns
        if (line.includes('function ') || line.includes('const ') || line.includes('class ')) {
            if (line.startsWith('$ +')) {
                changeTypes.add('feat');
            }
            else if (line.startsWith('$ -')) {
                changeTypes.add('refactor');
            }
        }
        // Detect test files
        if (currentFile.includes('test') || currentFile.includes('spec')) {
            changeTypes.add('test');
        }
        // Detect documentation changes
        if (currentFile.endsWith('.md') || currentFile.includes('README') || currentFile.includes('doc')) {
            changeTypes.add('docs');
        }
        // Detect configuration changes
        if (currentFile.includes('config') || currentFile.endsWith('.json') || currentFile.endsWith('.yml') || currentFile.endsWith('.yaml')) {
            changeTypes.add('chore');
        }
        // Detect bug fixes (common patterns)
        if (line.toLowerCase().includes('fix') || line.toLowerCase().includes('bug') || line.toLowerCase().includes('error')) {
            changeTypes.add('fix');
        }
    }
    // Determine primary change type based on add/remove ratio
    if (changeTypes.size === 0) {
        if (addedLines > removedLines * 2) {
            changeTypes.add('feat');
        }
        else if (removedLines > addedLines * 2) {
            changeTypes.add('refactor');
        }
        else {
            changeTypes.add('chore');
        }
    }
    return {
        fileTypes: Array.from(fileTypes),
        scopes: Array.from(scopes),
        changeTypes: Array.from(changeTypes)
    };
}
function generateConventionalCommitPrefix(analysis) {
    const primaryType = analysis.changeTypes[0] || 'chore';
    return primaryType;
}
function validateCommitMessage(message) {
    const suggestions = [];
    let isValid = true;
    // Extract message from git command format
    const match = message.match(/git commit -m "(.+)"/i);
    const actualMessage = match ? match[1] : message;
    // Check length
    if (actualMessage.length > 50) {
        suggestions.push('Consider shortening the message to 50 characters or less');
        isValid = false;
    }
    // Check imperative mood
    const firstWord = actualMessage.split(' ')[0].toLowerCase();
    const nonImperativeWords = ['adds', 'added', 'fixes', 'fixed', 'updates', 'updated', 'changes', 'changed'];
    if (nonImperativeWords.some(word => firstWord.includes(word))) {
        suggestions.push('Use imperative mood ("Add" instead of "Adds" or "Added")');
        isValid = false;
    }
    // Check for vague terms
    const vagueTerms = ['stuff', 'things', 'some', 'various', 'misc'];
    if (vagueTerms.some(term => actualMessage.toLowerCase().includes(term))) {
        suggestions.push('Be more specific instead of using vague terms');
        isValid = false;
    }
    // Check capitalization
    if (actualMessage[0] !== actualMessage[0].toUpperCase()) {
        suggestions.push('Start with a capital letter');
        isValid = false;
    }
    // Check for period at end
    if (actualMessage.endsWith('.')) {
        suggestions.push('Remove the ending period');
        isValid = false;
    }
    return { isValid, suggestions };
}
function buildCommitMessagePrompt(diff, previousCommitMessages = '') {
    // Analyze the diff for better context
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
      10. Avoid vague terms like "Fixes" or "Updates"; be specific.
      11. Use conventional commit format: ${conventionalPrefix}: message (DO NOT include scope in parentheses, only use the type prefix)
      12. Never include scope information like (dist,src) or (auth) in the commit message
      
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
    // Remove any extra spaces and add the diff at the end
    prompt = prompt.replace(/ {2,}/g, ' ') + diff;
    return prompt;
}
function buildEstimatePrompt() {
    addMessage("Good - NOW_CHAT - from now on you can chat like a normal person.");
    const exampleNote = "Example: Resolved issue with 'show all' for Feature B module.";
    const timeEstimateNote = "I only accept ranges like 0.5-1 hour, 1-2 hours, or 2-3 days. I just need one range answer.";
    let hintInfo = '';
    if (args['--hint']) {
        hintInfo = `
      The user provided this hint for the note. Please incorporate it into your note: "${args['--hint'] || ''}"
        `;
    }
    const prompt = `
      Based on the information I have provided, how could a note look like for the client?
      The note should not be very technical, as it is for the client.
      
      ${exampleNote}
      
      Also, how long time would you estimate that the changes in the diff would take to implement?
      ${timeEstimateNote}

      ${hintInfo}
      
      Please list those answers in points on new lines.
  
      Example:
      1. Added functionality to provide estimation. Made the process more user-friendly with non-technical language.
      2. Estimated implementation time: 1-2 hours.
    `;
    // Remove any extra spaces and return
    return prompt.replace(/ {2,}/g, ' ');
}
async function streamAssistant(save = true, overrideMessages = null, model = null, emptyLines = 0) {
    model = model || getDefaultModel();
    let content = '';
    // @ts-ignore
    const stream = await client.chat.completions.create({
        model,
        messages: overrideMessages || messages,
        stream: true,
        reasoning_effort: "none",
    });
    writeStdout('Assistant: ');
    emptyLine(emptyLines);
    for await (const part of stream) {
        const text = part.choices[0]?.delta?.content || '';
        content = configureStdout(content, text);
    }
    await speechAssistant(content);
    if (save) {
        addMessage(content, 'assistant');
    }
    return content;
}
async function speechAssistant(message, model = 'tts-1', voice = 'alloy') {
    if (!useVoice) {
        return;
    }
    // const speechFile = path.resolve("./speech.mp3");
    // const mp3 = await getClient().audio.speech.create({
    //     model: model,
    //     input: message,
    //     voice: voice as any
    // });
    // const buffer = Buffer.from(await mp3.arrayBuffer());
    // await fs.promises.writeFile(speechFile, buffer);
    // const player = play();
    // player.play(speechFile, (err) => {
    //     if (err) {
    //         console.error(err);
    //     }
    // });
}
async function getStatus() {
    return await resolveCommand("git status --porcelain --branch --short");
}
async function getDiff() {
    return await resolveCommand("git --no-pager diff -U25 --cached --stat --line-prefix '$ ' -- ':!package-lock.json' ':!composer.lock'", "No changes to commit");
}
async function getCliHistory() {
    try {
        return await resolveCommand("cat ~/.zsh_history | tail -n 50");
    }
    catch (error) {
        return "No history found";
    }
}
async function resolveCommand(command, defaultsTo = '') {
    consoleInfo("Resolving command: " + command, 1, 1, true);
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (stderr && typeof stderr === 'string' && stderr.includes('To github.com')) {
                return resolve(stderr || defaultsTo);
            }
            if (error || stderr) {
                return reject(error || stderr);
            }
            return resolve(stdout || defaultsTo);
        });
    });
}
function copyLastMessageToClipboard() {
    try {
        clipboardy.writeSync(getLatestMessage());
    }
    catch (error) {
        console.error('Could not copy to clipboard');
    }
}
function getLatestMessage() {
    return messages[messages.length - 1].content;
}
function consoleHeader(title, l1 = 1, l2 = 2, onlyVerbose = false) {
    if (!verbose && onlyVerbose) {
        return;
    }
    emptyLine(l1);
    writeStdout("-------------------- " + title + " ---------------------", colors.header);
    emptyLine(l2);
}
function consoleInfo(title, l1 = 1, l2 = 2, onlyVerbose = false) {
    if (!verbose && onlyVerbose) {
        return;
    }
    emptyLine(l1);
    writeStdout(">>>> " + title, 34);
    emptyLine(l2);
}
const addMessage = (message, role = 'user') => {
    consoleInfo("Adding message: " + message, 1, 1, true);
    messages.push({ role, content: message });
};
const configureStdout = (content, text) => {
    writeStdout(text, colors.assistant);
    return content += text;
};
const colors = {
    assistant: 32,
    system: 34,
    header: 33,
};
const writeStdout = (content, color = null) => {
    if (color) {
        process.stdout.write(`\x1b[${color}m`);
    }
    process.stdout.write(content);
    if (color) {
        process.stdout.write('\x1b[0m');
    }
};
const emptyLine = (times = 1) => {
    for (let i = 0; i < times; i++) {
        writeStdout('\n');
    }
};
main();
