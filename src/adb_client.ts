import { exec } from "child_process";
import { promisify } from "util";
import { parseUiDump } from "./ui_dump_parser";
import { isTemplateExpression } from "typescript/lib/typescript";

const execAsync = promisify(exec);

const ANDROID_KEY_EVENTS: Record<string, string> = Object.entries({
  Enter: "KEYCODE_ENTER",
  Backspace: "KEYCODE_DEL",
  Tab: "KEYCODE_TAB",
  ArrowUp: "KEYCODE_DPAD_UP",
  ArrowDown: "KEYCODE_DPAD_DOWN",
  ArrowLeft: "KEYCODE_DPAD_LEFT",
  ArrowRight: "KEYCODE_DPAD_RIGHT",
  Escape: "KEYCODE_ESCAPE",
  Home: "KEYCODE_HOME",
  Back: "KEYCODE_BACK",
}).reduce((keyMap, [key, value]) => {
  keyMap[key.toLowerCase().trim()] = value;
  return keyMap;
}, {} as Record<string, string>);

interface Coordinate {
  x: number;
  y: number;
}

export class ADBClient {
  async init() {
    await this.shell("settings put global window_animation_scale 0");
    await this.shell("settings put global transition_animation_scale 0");
    await this.shell("settings put global animator_duration_scale 0");
  }

  async screenshot() {
    const options = {
      encoding: "binary" as const,
      maxBuffer: 5 * 1024 * 1024, // Reduced buffer size to 5MB
    };
    const { stdout } = await execAsync(`adb exec-out screencap -p`, options);
    return Buffer.from(stdout, "binary");
  }

  async screenSize() {
    const { stdout } = await this.execOut("wm size");
    const match = stdout.match(/Physical size: (\d+)x(\d+)/);
    if (!match) {
      throw new Error("Failed to get viewport size");
    }
    return {
      width: parseInt(match[1]),
      height: parseInt(match[2]),
    };
  }

  async execOut(command: string) {
    return execAsync(`adb exec-out ${command}`);
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
    const androidKey = ANDROID_KEY_EVENTS[key.toLowerCase()];
    if (!androidKey) {
      throw new Error(`Unsupported key: ${key}`);
    }

    return this.shell(`input keyevent ${androidKey}`);
  }

  async listPackages(filter?: string) {
    const { stdout } = await this.execOut(`pm list packages ${filter || ""}`);
    return stdout
      .split("\n")
      .map((line) => line.replace("package:", "").trim())
      .filter(Boolean);
  }

  async openApp(packageName: string) {
    const result = await this.shell(`monkey -p ${packageName} 1`);
    if (result.stderr && result.stderr.includes("No activities found")) {
      throw new Error(`Failed to open app: ${result.stderr}`);
    }
    return result;
  }

  async dumpUI() {
    try {
      const { stdout } = await this.execOut(
        `uiautomator dump --compressed /dev/tty`
      );
      const ui = JSON.stringify(parseUiDump(stdout));
      return ui;
    } catch (error) {
      throw new Error(`Failed to get UI hierarchy: ${error.message}`);
    }
  }
}
