import { generateText, LanguageModel, tool } from "ai";
import { z } from "zod";
import { ADBClient } from "./adb_client";
import { createMobileComputer } from "./mobile_computer";
import { openai } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import * as readline from 'readline';

const azure = createAzure({
  resourceName: "agent-dalal",
  apiKey: "",
  apiVersion: "2024-12-01-preview"
});

const anthropic = createAnthropic({
  apiKey: "",
});

export { ADBClient } from "./adb_client";

const MobileUsePrompt = `You are an experienced mobile automation engineer. 
Your job is to navigate olacabs app on an android device and perform actions to fullfil request of the user.

<steps>
The app is already open.
Do not take ui dump more than once per action. If you think you don't need to take ui dump, skip it. Use it sparingly.
Ask for human input to show options of different rides, ask for user's choice if you need to. 
</steps>
`;

interface MobileUseOptions {
  task: string;
  llm?: LanguageModel;
}

export async function mobileUse({
  task,
  llm = anthropic("claude-3-5-sonnet-20240620"),
}: MobileUseOptions) {
  const adbClient = new ADBClient();
  await adbClient.init();
  const computer = await createMobileComputer(adbClient);
  
  // Always launch OLA app first
  await adbClient.openApp("com.olacabs.customer");

  const human = tool({
    description: "Ask the human user for input",
    parameters: z.object({
      message: z.string().optional().describe("Message to display to the human"),
    }),
    async execute({ message }) {
      const promptMessage = message || "Please provide input:";
      console.log(promptMessage);
      const response = await getUserInput(promptMessage);
      return response;
    }
  });

  const response = await generateText({
    messages: [
      {
        role: "system",
        content: MobileUsePrompt,
      },
      {
        role: "user",
        content: task,
      },
    ],
    model: llm,
    maxRetries: 3,
    maxSteps: 100,
    tools: {
      computer,
      human
    },
  });
  return response;
}

async function getUserInput(promptMessage: string) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(promptMessage, (answer) => {
      rl.close();
      resolve({ response: answer });
    });
  });
}


