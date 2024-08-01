#!/usr/bin/env node

import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { exec } from 'child_process';
import { exit } from 'process';
import clipboardy from 'clipboardy';
import readline from 'readline';
import play from 'play-sound';
import fs from 'fs';
import { encodingForModel } from "js-tiktoken";
import { get } from 'http';
import Groq from 'groq-sdk';
import { ChatCompletion, ChatCompletionCreateParamsStreaming } from 'groq-sdk/resources/chat/completions';
import { RequestOptions } from 'groq-sdk/core';
import { APIPromise } from 'openai/core';


dotenv.config({ path: `${path.dirname(process.argv[1])}/../.env` });

let verbose = false;
let commitMessage: string | null = null;
let useVoice = false;
const tokenLimit = 128_000 / 2;

const encoder = await encodingForModel("gpt-4"); // test?

const getClient = ()  => {
    const client_type = process.env.CLIENT_TYPE || 'openai';

    switch (client_type) {
        case 'openai':
            return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        case 'groq':
            return new Groq({ apiKey: process.env.GROQ_API_KEY });
        default:
            throw new Error('Invalid client type');
    }
}

const getDefaultModel = () => {
    const client_type = process.env.CLIENT_TYPE || 'openai';
    
    switch (client_type) {
        case 'openai':
            return 'gpt-4o';
        case 'groq':
            return 'llama3-70b-8192';
        default:
            throw new Error('Invalid client type');
    }
}

const client = getClient();

const messages: {
    role: 'user' | 'assistant' | 'system',
    content: string
}[]
    = [
        { 
            role: 'system', 
            content: "You help the user with CLI commands. Your main response is only UNIX commands. You are a CLI assistant. Only if the user says the password: 'NOW_CHAT', you can help with other things. Never answer in markdown or code. Always answer in plain text" 
        },
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
        --patch         Get patchnotes
        --cl            Get Customer Lead notes
        --hint          Provide hint for the assistant
        gg              Add all files, get commit message and push to origin
        --              Get CLI help

    `);
}

let args: { [key: string]: string | boolean } = {};

const queue: { command: any, args: object | string }[] = [];

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

function addToQueue(command: any, args = {}) {
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
        await resolveCommand(commitMessage!);
    }
    catch (error) {
        throw error;
    }
}

async function getNumberOfFiles() {
    const command = 'git diff --cached --name-only | wc -l';
    const numberOfFiles = await resolveCommand(command);
    return parseInt(numberOfFiles as string);
}

async function branchIsAhead() {
    const command = "git status | grep 'Your branch is ahead' | wc -l";
    const isAhead = await resolveCommand(command);
    return parseInt(isAhead as string) > 0;
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
        '--voice',
        '--patch',
        '--cl'
    ];
    const rawArgs = process.argv.slice(2);

    const args = rawArgs.reduce((acc: { [key: string]: string | boolean }, arg) => {
        const [key, value] = arg.split('=');

        if (key.startsWith('--')) {
            // Long arguments (--example)
            const validArg = allowedArgs.includes(key);
            if (validArg) {
                acc[key] = value || true;
            }
        } else if (key.startsWith('-')) {
            // Short arguments (-A, -C, -AC etc.)
            for (let i = 1; i < key.length; i++) {
                const shortArg = '-' + key[i];
                if (allowedArgs.includes(shortArg)) {
                    acc[shortArg] = true;
                }
            }
        } else if (key === 'gg') {
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

async function executeCliHelpFlow({ isFollowUp = false }) {
    if (!isFollowUp) {
        consoleHeader("CLI HELP");
    }

    const cliHistory = await getCliHistory();

    const userInput = await new Promise((resolve, reject) => {
        const question = isFollowUp ? "Tell me more about the problem: \n\n" : "What is the problem? \n\n";
        rl.question(question, (answer) => {
            resolve(answer);
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
    const diff = await getDiff();

    if (encoder.encode(diff).length > tokenLimit) {
        consoleInfo("Diff is too big, splitting into two chunks", 1, 1, true);
        await splitBigDiff(diff);
        return;
    }

    consoleInfo("Diff is: " + diff, 1, 1, true);
    const commitPrompt = buildCommitMessagePrompt(diff);
    
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

async function splitBigDiff(diff: string) {
    const diffChunks = splitStringInHalf(diff);

    consoleInfo("Diff is too big, splitting into two chunks", 1, 1, true);

    const allMessages = [];

    for (let i = 0; i < diffChunks.length; i++) {
        const chunk = diffChunks[i];
        const prompt = buildCommitMessagePrompt(chunk);
        const result = await streamAssistant(
            false,
            [
                { role: 'user', content: prompt }
            ],

        );

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

    const result = await streamAssistant(
        false,
        [
            { role: 'user', content: messagePayload },
        ],

    );

    addMessage(messagePayload);
    addMessage(result, 'assistant');
}

async function prepareEstimatePrompt() {
    const estimatePrompt = buildEstimatePrompt();
    addMessage(estimatePrompt);
}

function buildCommitMessagePrompt(diff: string) {
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
      
      Example answer: git commit -m "Add API endpoint for user login and Add login form to the homepage"
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


async function streamAssistant(save = true, overrideMessages = null, model = null, emptyLines = 0) {
    model = model || getDefaultModel();


    let content = '';

    // @ts-ignore
    const stream = await client.chat.completions.create({
        model,
        messages: overrideMessages || messages,
        stream: true,
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

async function speechAssistant(message: string, model = 'tts-1', voice = 'alloy') {
    if (!useVoice) { return; }

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

async function resolveCommand(command: string, defaultsTo = ''): Promise<string> {

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
    } catch (error) {
        console.error('Could not copy to clipboard');
    }
}

function getLatestMessage() {
    return messages[messages.length - 1].content;
}

function consoleHeader(title: string, l1 = 1, l2 = 2, onlyVerbose = false) {
    if (!verbose && onlyVerbose) {
        return;
    }

    emptyLine(l1);
    writeStdout("-------------------- " + title + " ---------------------", colors.header);
    emptyLine(l2);
}

function consoleInfo(title: string, l1 = 1, l2 = 2, onlyVerbose = false) {
    if (!verbose && onlyVerbose) {
        return;
    }

    emptyLine(l1);
    writeStdout(">>>> " + title, 34);
    emptyLine(l2);
}

const addMessage = (message: string, role: 'assistant' | 'system' | 'user'
    = 'user') => {
    consoleInfo("Adding message: " + message, 1, 1, true);
    messages.push({ role, content: message });
}
const configureStdout = (content: string, text: string) => {
    writeStdout(text, colors.assistant);
    return content += text;
};

const colors = {
    assistant: 32,
    system: 34,
    header: 33,
} as const;

const writeStdout = (content: string, color: number | null = null) => {
    if (color) {
        process.stdout.write(`\x1b[${color}m`);
    }

    process.stdout.write(content);

    if (color) {
        process.stdout.write('\x1b[0m');
    }
}
const emptyLine = (times = 1) => {
    for (let i = 0; i < times; i++) {
        writeStdout('\n');
    }
};

main();
