// node /Users/tobiaswecode/projects/chatgpt/test.mjs

import { ChatGPTAPI } from "chatgpt";
import { exec } from "child_process";
import { exit } from "process";
import clipboardy from "clipboardy";
import dotenv from "dotenv";
import path from "path";
import { encode, decode } from "gpt-3-encoder";

dotenv.config({
  path: `${path.dirname(process.argv[1])}/.env`,
});

let diff = "";

// execute the command and get the output
exec(
  "git --no-pager diff --cached -U5  --line-prefix '$ '",
  async (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
    }
    diff = stdout;

    console.log(diff);

    if (diff === "") {
      console.log("No changes to commit");
      exit(0);
    }

    let res;

    res = await getCommit();
    res = await getImprovements(res);
    res = await getHarvestMessage(res);
    exit(0);
  }
);

const api = new ChatGPTAPI({
  apiKey: process.env.OPENAI_API_KEY,
  completionParams: {
    model: "gpt-4"
  }
});

const getCommit = async (prev = null) => {
  console.log(" ");
  console.log("-------------------- Commit ---------------------");
  console.log(" ");

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

  prompt = prompt.replaceAll("  ", "") + diff;

  prompt = prompt + "The command is: "

  // console.log(prompt);

  let result = await split(
    prompt,
    prev
  );

  const commit_command = result.text;

  console.log(commit_command);
  clipboardy.writeSync(commit_command);
  clipboardy.readSync();

  const prompt2 = `Why did you come up with this commit message?
                  What was your thought process?

                  You should not pretend that you wrote the code. You just need to explain why you came up with this commit message.   
                  
                  Also please clarify for me how many sections i provided you with. I want to know if you read the whole thing or not.
                   `;

  const result2 = await split(prompt2, result);

  console.log(result2.text);

  console.log(" ");

  console.log(commit_command);

  return result2;
};

const getImprovements = async (prev = null) => {
  console.log(" ");
  console.log("-------------------- Improvements ---------------------");
  console.log(" ");

  const prompt = `Tell me what you think I could based on the code changes. 
                  Is the changes good or bad? What could I do better?
                  `;

  const result = await split(prompt, prev);

  const consoleColor = "color: #00ff00; font-weight: bold;";

  console.log(`%c${result.text}`, consoleColor);

  return result;
};

const getHarvestMessage = async (prev = null) => {
  console.log(" ");
  console.log("-------------------- Harvest ---------------------");
  console.log(" ");

  const prompt = `Based on the information i have provided, how could a note look like in Harvest?
                  The note should not be very technical, as it is for the client.
                  
                  An example of a note in Harvest is: "Resolved issue with 'show all' for Feature B module."
                  
                  also how long time would you estimate that the changes in the diff would take to implement? I only accept ranges like 0.5-1 hour, 1-2 hours or 2-3 days. I just need one range answer. Please

                  list those answers in points on new lines.
                  "  
  `;

  const result = await split(prompt, prev);

  const consoleColor = "color: #00ff00; font-weight: bold;";

  console.log(`%c${result.text}`, consoleColor);

  return result;
};

const split = async (text, prev = null, additional = null) => {
  const encoded = encode(text);

  console.log(encoded);

  const results = [];

    let prompt = text + "\n\n" + additional;

    prev = await api.sendMessage(prompt, {
      conversationId: prev?.conversationId,
      parentMessageId: prev?.id,
    });

    results.push(prev);

  return results[results.length - 1];
};
