import { mobileUse } from "@/src";

async function main() {
  // here we are using claude 3.5 sonnet
  const response = await mobileUse({
    task: "Open instagram and go to direct messages, send hi {instagram_username} to the first person",
  });
  console.log(response.text);
}

main();
