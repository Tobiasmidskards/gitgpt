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
        const text = part.choices[0]?.text || '';
        process.stdout.write(text);
        content += text;
    }
    
    addMessage(content, 'assistant');
}

async function getDiff() {
    return new Promise((resolve, reject) => {
        exec(
            "git --no-pager diff -U5",
            async (error, stdout, stderr) => {
                if (error) {
                    console.log(`error: ${error.message}`);
                    reject(error);
                }
                if (stderr) {
                    console.log(`stderr: ${stderr}`);
                    reject(stderr);
                }
                resolve(stdout);
            }
        );
    });
}

async function main() {
    const diff = await getDiff();
    console.log(diff);
    addMessage(
        "The diff comes from this command: git --no-pager diff --cached -U5" +
        "What could the commit message be?" +
        "\n\n" +
        diff
    );
    await stream();
    console.log(messages);
}

main();