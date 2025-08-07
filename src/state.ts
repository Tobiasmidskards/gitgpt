import { encodingForModel } from "js-tiktoken";

// Global mutable state, accessed via getters/setters for safety
let verbose = false;
let useVoice = false;
let commitMessage: string | null = null;
let args: { [key: string]: string | boolean } = {};

export const tokenLimit = 512_000 / 2;
export const encoder = await encodingForModel("gpt-4");

export function isVerbose(): boolean {
  return verbose;
}

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVoiceEnabled(): boolean {
  return useVoice;
}

export function setVoiceEnabled(value: boolean): void {
  useVoice = value;
}

export function getCommitMessage(): string | null {
  return commitMessage;
}

export function setCommitMessage(value: string | null): void {
  commitMessage = value;
}

export function getStateArgs(): { [key: string]: string | boolean } {
  return args;
}

export function setStateArgs(newArgs: { [key: string]: string | boolean }): void {
  args = { ...newArgs };
}

export function updateStateArgs(partial: { [key: string]: string | boolean }): void {
  args = { ...args, ...partial };
}


