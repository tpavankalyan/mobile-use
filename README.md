<div align="center">

### Mobile use

Use AI to control your mobile.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) [![Discord](https://img.shields.io/badge/discord-purple.svg)](https://discord.gg/BECB2t5x)

https://github.com/user-attachments/assets/88ab0a2d-d6e6-4d80-922e-b13d3ae91c85

</div>

## Supported

Currently, only android phones are supported. You need to have android platform sdk tools installed locally (adb) to use this library.

## 📦 Installation

```bash
npm install mobile-use
```

## 🔧 Usage

```ts
import { mobileUse } from "@/src";

const response = await mobileUse({
  task: "Open instagram and go to direct messages, send hi to first person",
  // llm: bring your own LLM model using ai sdk provider or use the claude by default. You need set ANTHROPIC_API_KEY environment variable to use claude.
});

console.log(response.text);
```

## Terminal Usage

There is an included CLI tool that can be used to act on instructions from the command line or from a file.

```bash
# Pass the instruction from the command line
npx mobile-use "Open instagram and go to direct messages, send hi to first person"

# Pass the instruction from a file
npx mobile-use instruction.txt
```

## 📄 License

This project is licensed under the [MIT License](LICENSE).
