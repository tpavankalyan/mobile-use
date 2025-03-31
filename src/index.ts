import { generateText, LanguageModel, tool } from "ai";
import { z } from "zod";
import { ADBClient } from "./adb_client";
import { createMobileComputer } from "./mobile_computer";
import { openai } from "@ai-sdk/openai";
export { ADBClient } from "./adb_client";

const MobileUsePrompt = `You are an experienced mobile automation engineer. 
Your job is to navigate an android device and perform actions to fullfil request of the user.

<steps>
If the user asks to use a specific app in the request, open it before performing any other action.
Do not take ui dump more than once per action. If you think you don't need to take ui dump, skip it. Use it sparingly.
</steps>
`;

interface MobileUseOptions {
  task: string;
  llm?: LanguageModel;
}

export async function mobileUse({
  task,
  llm = openai("gpt-4o"),
}: MobileUseOptions) {
  const adbClient = new ADBClient();
  await adbClient.init();
  const computer = await createMobileComputer(adbClient);
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
      openApp: tool({
        parameters: z.object({
          name: z
            .string()
            .describe(
              "package name of the app to open such as com.google.android.dialer"
            ),
        }),
        description: "Open an on on android device.",
        async execute({ name }) {
          await adbClient.openApp(name);
          return `Successfull opened ${name}`;
        },
      }),
      listApps: tool({
        parameters: z.object({
          name: z.string().describe("Name of the package to filter."),
        }),
        description: "Use this to list packages.",
        async execute({ name }) {
          const list = await adbClient.listPackages(name);
          return list.join("\n");
        },
      }),
      computer,
    },
  });
  return response;
}
