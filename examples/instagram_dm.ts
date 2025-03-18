import { mobileUse } from "@/src";

async function main() {
  const response = await mobileUse({
    task: "Open instagram and go to direct messages, send hi cutie to first person",
  });
  console.log(response.text);
}

main();
