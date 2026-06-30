import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

const audioFile = "/Users/bingqing/bbq-and-david/bangbangbangbang.m4a";
const endpoint = "https://bbq-and-david.vercel.app/api/command";
const intervalMs = 10_000;

async function playAudio() {
  try {
    await access(audioFile, constants.F_OK);
  } catch {
    console.error(`Could not find the audio file at:\n${audioFile}`);
    return;
  }

  console.log("Playing audio...");

  await new Promise((resolve, reject) => {
    const player = spawn("/usr/bin/afplay", [audioFile], {
      stdio: ["ignore", "inherit", "inherit"],
    });

    player.on("error", reject);
    player.on("close", (code) => {
      if (code) {
        reject(new Error(`afplay exited with code ${code}`));
        return;
      }

      resolve();
    });
  });
}

async function checkForCommand() {
  try {
    const response = await fetch(endpoint);
    const data = await response.json();

    if (data?.command !== "PLAY") {
      return;
    }

    console.log("PLAY received");
    await playAudio();

    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: null }),
    });

    console.log("Command cleared");
  } catch (error) {
    console.warn(`Warning: ${error.message}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log("Listening...");
console.log("Checking every 10 seconds...");

while (true) {
  await checkForCommand();
  await wait(intervalMs);
}
