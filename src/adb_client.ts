import { exec } from "child_process";
import { promisify } from "util";
import { parseUiDump } from "./ui_dump_parser";

const execAsync = promisify(exec);

const ANDROID_KEY_EVENTS: Record<string, string> = {
  Enter: "KEYCODE_ENTER",
  Backspace: "KEYCODE_DEL",
  Tab: "KEYCODE_TAB",
  ArrowUp: "KEYCODE_DPAD_UP",
  ArrowDown: "KEYCODE_DPAD_DOWN",
  ArrowLeft: "KEYCODE_DPAD_LEFT",
  ArrowRight: "KEYCODE_DPAD_RIGHT",
  Escape: "KEYCODE_ESCAPE",
  Home: "KEYCODE_HOME",
};

interface Coordinate {
  x: number;
  y: number;
}

export class ADBClient {
  async screenshot() {
    const options = {
      encoding: "binary" as const,
      maxBuffer: 25 * 1024 * 1024, // Reduced buffer size to 25MB
    };
    const { stdout } = await execAsync(`adb shell screencap -p`, options);
    return Buffer.from(stdout, "binary");
  }

  async screenSize() {
    const { stdout } = await this.shell("wm size");
    const match = stdout.match(/Physical size: (\d+)x(\d+)/);
    if (!match) {
      throw new Error("Failed to get viewport size");
    }
    return {
      width: parseInt(match[1]),
      height: parseInt(match[2]),
    };
  }

  async shell(command: string) {
    return execAsync(`adb shell ${command}`);
  }

  async doubleTap(coordinate: Coordinate) {
    const { x, y } = coordinate;
    await this.shell(`input tap ${x} ${y}`);
    return this.shell(`input tap ${x} ${y}`);
  }

  async tap(coordinate: Coordinate) {
    const { x, y } = coordinate;
    return this.shell(`input tap ${x} ${y}`);
  }

  async swipe(start: Coordinate, end: Coordinate, duration: number = 300) {
    const { x: startX, y: startY } = start;
    const { x: endX, y: endY } = end;
    return this.shell(
      `input swipe ${startX} ${startY} ${endX} ${endY} ${duration}`
    );
  }

  async type(text: string) {
    return this.shell(`input text "${text.replace(/["\s]/g, "\\ ")}"`);
  }

  async keyPress(key: string) {
    const androidKey = ANDROID_KEY_EVENTS[key];
    if (!androidKey) {
      throw new Error(`Unsupported key: ${key}`);
    }

    return this.shell(`input keyevent ${androidKey}`);
  }

  async listPackages(filter?: string) {
    const { stdout } = await this.shell(`pm list packages ${filter || ""}`);
    return stdout
      .split("\n")
      .map((line) => line.replace("package:", "").trim())
      .filter(Boolean);
  }

  async openApp(packageName: string) {
    // Launch app using package name without specifying activity
    const result = await this.shell(`monkey -p ${packageName} 1`);
    if (result.stderr && result.stderr.includes("No activities found")) {
      throw new Error(`Failed to open app: ${result.stderr}`);
    }
    return result;
  }

  async dumpUI() {
    try {
      // Dump the current UI hierarchy directly
      await this.shell("uiautomator dump");
      // Read the dump file (it's automatically created at /sdcard/window_dump.xml)
      const { stdout } = await this.shell("cat /sdcard/window_dump.xml");
      // Clean up
      await this.shell("rm /sdcard/window_dump.xml");
      return JSON.stringify(parseUiDump(stdout));
    } catch (error) {
      throw new Error(`Failed to get UI hierarchy: ${error.message}`);
    }
  }
}
