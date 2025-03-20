import { tool } from "ai";
import { ADBClient } from "./adb_client";
import { z } from "zod";
import { wait } from "./utils";

const Coordinate = z.array(z.number());

export const createMobileComputer = async (adbClient: ADBClient) => {
  const viewportSize = await adbClient.screenSize();
  const mobileComputer = tool({
    description: `Mobile tool to perform actions on a mobile device.
You have the following actions:
dump_ui: Use this action to get current screen and associated UI elements that you can interact with.
tap: Use this to tap. You need to provide coordinate.
swipe: Use this to swipe. You need to provide start_coordinate and end_coordinate to start your swipe to end.
type: Use this to type what you want to. Provide what you want to type in text.
press: Any key you want to press. Provide the key as text.
screenshot: Take a screenshot of the current screen.
`,

    experimental_toToolResultContent(result: any) {
      return typeof result === "string"
        ? [{ type: "text", text: result }]
        : [{ type: "image", data: result?.data, mimeType: "image/png" }];
    },
    args: {
      displayHeightPx: viewportSize.height,
      displayWidthPx: viewportSize.width,
      displayNumber: 0,
    },
    parameters: z.object({
      action: z.enum([
        "dump_ui",
        "tap",
        "swipe",
        "type",
        "press",
        "wait",
        "screenshot",
      ]),
      coordinate: Coordinate.optional(),
      start_coordinate: Coordinate.optional(),
      end_coordinate: Coordinate.optional(),
      text: z.string().optional(),
      duration: z.number().optional(),
    }),
    async execute({
      action,
      coordinate,
      text,
      duration,
      start_coordinate,
      end_coordinate,
    }) {
      if (action === "dump_ui") {
        return adbClient.dumpUI();
      }

      if (action === "tap") {
        const [x, y] = coordinate;
        await adbClient.tap({ x, y });
        return adbClient.dumpUI();
      }

      if (action === "press") {
        await adbClient.keyPress(text);
        return adbClient.dumpUI();
      }

      if (action === "type") {
        await adbClient.type(text);
        return adbClient.dumpUI();
      }

      if (action === "screenshot") {
        const screenshot = await adbClient.screenshot();
        return {
          data: screenshot.toString("base64"),
          type: "image/png",
        };
      }

      if (action === "swipe") {
        const [start_coordinate_x, start_coordinate_y] = start_coordinate;
        const [end_coordinate_x, end_coordinate_y] = end_coordinate;
        await adbClient.swipe(
          { x: start_coordinate_x, y: start_coordinate_y },
          {
            x: end_coordinate_x,
            y: end_coordinate_y,
          },
          duration
        );
        return adbClient.dumpUI();
      }

      if (action === "wait") {
        await wait(duration);
      }
    },
  });

  return mobileComputer;
};
