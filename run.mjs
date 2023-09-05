import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from "path";
import { exec } from "child_process";
import { exit } from "process";
import clipboardy from "clipboardy";

dotenv.config({
    path: `${path.dirname(process.argv[1])}/.env`,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const messages = [];

const addMessage = (message, role = 'user') => {
    messages.push({ role, content: message });
}

async function stream(model = 'gpt-4') {
    let content = '';
    const stream = await openai.chat.completions.create({
        model,
        messages,
        stream: true,
    });
    for await (const part of stream) {
        const text = part.choices[0]?.delta?.content || '';
        process.stdout.write(text);
        content += text;
    }
    
    addMessage(content, 'assistant');
}

async function getDiff() {
    return new Promise((resolve, reject) => {
        exec(
            "git --no-pager diff -U5 --cached --line-prefix '$ '",
            async (error, stdout, stderr) => {
                if (error) {
                    console.log(`error: ${error.message}`);
                    reject(error);
                }
                if (stderr) {
                    console.log(`stderr: ${stderr}`);
                    reject(stderr);
                }

                if (stdout === "") {
                    stdout = "No changes to commit";
                }

                resolve(stdout);
            }
        );
    });
}

async function getCommit() {
    addMessage("You help the user with CLI commands. Your main response is only UNIX commands. You are a CLI assistant. Only if the user explicitly asks for it, you can help with other things.");

    let prompt = `The diff comes from this command: git --no-pager diff --cached -U5 --line-prefix '$ '

    Every line starts with $ and a space.
    Keep in mind that if a new line is added without any other changes, then the line is still added to the diff, but you should not add it to the commit message.

    ----

    IMPORTANT:
    The message should follow these rules!: 
    1. written in the imperative mood.
    2. short and concise.
    3. max 50 characters long.
    4. in english.
    5. only one line.
    6. example response: git commit -m "commit message"

    ----

    If there is not enough information about the commit, then return with "not enough information".
    
    + means that the line was added
    - means that the line was removed
    
    Your response should be like this: git commit -m "commit message"
    Remember to answer with a command like: git commit -m "commit message" with lowercase letters for the command.
    I do not accept any other answers. 

    The diff is:
    `;

    prompt = prompt.replaceAll("  ", "") + await getDiff();

    addMessage(prompt);
    await stream();

    copyToClipboard(messages[messages.length - 1].content);
}

const copyToClipboard = (text) => {
    clipboardy.writeSync(text);
}

async function main() {
    await getCommit();
    exit(0);
}

main();