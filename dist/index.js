import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { exit } from 'process';
import clipboardy from 'clipboardy';
import readline from 'readline';
import play from 'play-sound';
import fs from 'fs';
dotenv.config({ path: `${path.dirname(process.argv[1])}/../.env` });
let verbose = false;
let commitMessage = null;
let useVoice = false;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const messages = [
    { role: 'system', content: "You help the user with CLI commands. Your main response is only UNIX commands. You are a CLI assistant. Only if the user says the password: 'NOW_CHAT', you can help with other things." },
];
const showHelp = () => {
    process.stdout.write(`
        Usage: npm start -- [--help] [--commit] [--estimate] [--push] [--add] [--verbose] [--hint] [gg] [--]

        Defaults to all flows if no options are provided.
        
        Options:
        -h --help   
        -C --commit     Get commit message
        -E --estimate   Get estimate
        -P --push       Push to origin
        -A --add        Add all files
        -v --verbose    Show verbose output
        --hint          Provide hint for the assistant
        gg              Add all files, get commit message and push to origin
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
    if (argLength === 0 || args['-A'] || args['--add']) {
        // Takes all added files and gets the commit message
        addToQueue(executeStatusFlow);
        addToQueue(executeGetCommitMessageFlow);
    }
    await runQueue();
    exit(0);
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
        '--hint',
        '-A',
        '-C',
        '--',
        'gg',
        '--voice'
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
        return acc;
    }, {});
    if (Object.keys(args).length === 0 && rawArgs.length > 0) {
        args['--hint'] = rawArgs.join(' ');
    }
    return args;
}
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
async function executeCliHelpFlow() {
    consoleHeader("CLI HELP");
    const cliHistory = await getCliHistory();
    const userInput = await new Promise((resolve, reject) => {
        rl.question("What is the problem? \n\n", (answer) => {
            resolve(answer);
        });
    });
    const prompt = `
    
    Which Mac command would you use to solve this problem? 
    The user provided this information:
    ${userInput}
    
    This is the history of the user's last 50 commands:
    ${cliHistory}
    
    Answer only with the command, not the explanation.
    `;
    addMessage(prompt);
    emptyLine();
    await streamAssistant();
    copyLastMessageToClipboard();
    rl.close();
    emptyLine(2);
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
}
async function executeEstimateFlow() {
    consoleHeader("Harvest");
    await prepareEstimatePrompt();
    await streamAssistant();
}
async function executeStatusFlow() {
    consoleHeader("STATUS");
    const status = await getStatus();
    writeStdout(status);
}
async function prepareCommitMessagePrompt() {
    const commitPrompt = buildCommitMessagePrompt(await getDiff());
    addMessage(commitPrompt);
}
async function prepareEstimatePrompt() {
    const estimatePrompt = buildEstimatePrompt();
    addMessage(estimatePrompt);
}
function buildCommitMessagePrompt(diff) {
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
      
      Example: git commit -m "Add login feature"
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
      The diff comes from this command: git --no-pager diff --cached -U5 --line-prefix '$ '
      Each line starts with $ .
      ----
      ${rules}
      ----
      ${additionalInfo}
      ----
      ${hintInfo}
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
async function streamAssistant(model = 'gpt-4-1106-preview') {
    let content = '';
    const stream = await openai.chat.completions.create({
        model,
        messages,
        stream: true
    });
    for await (const part of stream) {
        const text = part.choices[0]?.delta?.content || '';
        content = configureStdout(content, text);
    }
    await speechAssistant(content);
    addMessage(content, 'assistant');
}
async function speechAssistant(message, model = 'tts-1', voice = 'onyx') {
    if (!useVoice) {
        return;
    }
    const speechFile = path.resolve("./speech.mp3");
    const mp3 = await openai.audio.speech.create({
        model: model,
        input: message,
        voice: voice
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(speechFile, buffer);
    const player = play();
    player.play(speechFile, (err) => {
        if (err) {
            console.error(err);
        }
    });
}
async function getStatus() {
    return await resolveCommand("git status --porcelain --branch --short");
}
async function getDiff() {
    return await resolveCommand("git --no-pager diff -U5 --cached --line-prefix '$ '", "No changes to commit");
}
async function getCliHistory() {
    return await resolveCommand("cat ~/.zsh_history | tail -n 50");
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
    clipboardy.writeSync(getLatestMessage());
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
const addMessage = (message, role = 'user') => messages.push({ role, content: message });
const configureStdout = (content, text) => {
    writeStdout(text);
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
