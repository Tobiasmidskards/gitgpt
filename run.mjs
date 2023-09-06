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
    console.log(" ");
    console.log("-------------------- COMMIT ---------------------");
    console.log(" ");

    addMessage("You help the user with CLI commands. Your main response is only UNIX commands. You are a CLI assistant. Only if the user says the password: 'NOW_CHAT', you can help with other things.");

    let prompt = `
    The diff comes from this command: git --no-pager diff --cached -U5 --line-prefix '$ '
    Each line starts with $ .
    ----
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
    ----
    If commit details are insufficient, reply with "not enough information."
    
    + means that the line was added
    - means that the line was removed
    
    In the diff, + indicates an added line, - indicates a removed line.

    Respond only in this format: git commit -m "Commit message". Lowercase commands only.

    Diff is:
    `;

    prompt = prompt.replaceAll("  ", "") + await getDiff();

    addMessage(prompt);
    await stream();

    copyToClipboard(messages[messages.length - 1].content);
}

async function getEstimate() {
    console.log(" ");
    console.log(" ");
    console.log("-------------------- Harvest ---------------------");
    console.log(" ");

    const prompt = `NOW_CHAT
  
                  Based on the information i have provided, how could a note look like in Harvest?
                  The note should not be very technical, as it is for the client.
                  
                  An example of a note in Harvest is: "Resolved issue with 'show all' for Feature B module."
                  
                  also how long time would you estimate that the changes in the diff would take to implement? I only accept ranges like 0.5-1 hour, 1-2 hours or 2-3 days. I just need one range answer. Please

                  list those answers in points on new lines.

                  Example:
                  1. Added functionality to provide estimation. Made the process more user-friendly with non-technical language.
                  2. Estimated implementation time: 1-2 hours.
                  "  
  `;

    addMessage(prompt);
    await stream();
}

const copyToClipboard = (text) => {
    clipboardy.writeSync(text);
}

async function main() {
    await getCommit();
    await getEstimate();
    console.log(" ");
    exit(0);
}

main();