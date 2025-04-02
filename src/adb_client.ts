import { exec } from "child_process";
import { promisify } from "util";
import { parseUiDump } from "./ui_dump_parser";
import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import sharp from "sharp";

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

export function getPotentialADBPaths(): string[] {
  const home = homedir();
  const platform = process.platform;
  const paths: string[] = [];

  if (platform === "win32") {
    // Windows-specific paths
    paths.push(
      join(
        process.env.LOCALAPPDATA ?? "",
        "Android/Sdk/platform-tools/adb.exe"
      ),
      "C:\\Android\\sdk\\platform-tools\\adb.exe",
      join(home, "AppData/Local/Android/Sdk/platform-tools/adb.exe"),
      join(home, "AppData/Local/Android/android-sdk/platform-tools/adb.exe"),
      "C:\\Program Files\\Android\\android-sdk\\platform-tools\\adb.exe",
      "C:\\Program Files (x86)\\Android\\android-sdk\\platform-tools\\adb.exe"
    );
  } else if (platform === "darwin") {
    // macOS-specific paths
    paths.push(
      "/usr/local/bin/adb",
      "/opt/homebrew/bin/adb",
      join(home, "Library/Android/sdk/platform-tools/adb"),
      "/Applications/Android Studio.app/Contents/sdk/platform-tools/adb"
    );
  } else if (platform === "linux") {
    // Linux-specific paths
    paths.push(
      "/usr/local/bin/adb",
      "/usr/bin/adb",
      join(home, "Android/Sdk/platform-tools/adb"),
      "/opt/android-sdk/platform-tools/adb",
      "/opt/android-studio/sdk/platform-tools/adb"
    );
  } else {
    // Other platforms (FreeBSD, OpenBSD, etc.)
    paths.push(
      "/usr/local/bin/adb",
      "/usr/bin/adb",
      join(home, "android-sdk/platform-tools/adb")
    );
  }

  // Add ANDROID_HOME path for all platforms
  if (process.env.ANDROID_HOME) {
    const adbExecutable = platform === "win32" ? "adb.exe" : "adb";
    paths.push(join(process.env.ANDROID_HOME, "platform-tools", adbExecutable));
  }

  return paths;
}

export interface ADBClientOptions {
  adbPath?: string;
}

export class ADBClient {
  private adbPath: string;

  constructor(options?: ADBClientOptions) {
    if (!options?.adbPath) {
      this.adbPath = this.getAdbPath();
    } else {
      this.adbPath = options.adbPath;
    }
  }

  getAdbPath() {
    const paths = getPotentialADBPaths();
    const validPath = paths.find((path) => existsSync(path));

    if (!validPath) {
      throw new Error(
        "ADB not found. Please ensure Android SDK is installed and properly configured."
      );
    }
    return validPath;
  }

  async init() {
    await this.shell("settings put global window_animation_scale 0");
    await this.shell("settings put global transition_animation_scale 0");
    await this.shell("settings put global animator_duration_scale 0");
  }

  async screenshot() {
    const { stdout } = await execAsync(
      `"${this.adbPath}" exec-out screencap -p`,
      {
        encoding: "buffer",
        maxBuffer: 25 * 1024 * 1024,
      }
    );
    return sharp(stdout)
      .png({
        quality: 25,
      })
      .toBuffer();
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
    return execAsync(`"${this.adbPath}" exec-out ${command}`);
  }

  async shell(command: string) {
    return execAsync(`"${this.adbPath}" shell ${command}`);
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
