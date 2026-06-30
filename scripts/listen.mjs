import { spawn } from "node:child_process";

const endpoint = "https://bbq-and-david.vercel.app/api/command";
const intervalMs = 10_000;

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code) {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

async function getAudioStreamUrl(url) {
  const output = await run("python3", [
    "-m",
    "yt_dlp",
    "--no-playlist",
    "-f",
    "bestaudio",
    "-g",
    url,
  ]);

  const streamUrl = output.split("\n").find(Boolean);

  if (!streamUrl) {
    throw new Error("yt-dlp did not return an audio stream URL.");
  }

  return streamUrl;
}

async function playYouTube(url) {
  if (!url) {
    throw new Error("PLAY command did not include a YouTube URL.");
  }

  const streamUrl = await getAudioStreamUrl(url);

  console.log("Playing audio...");

  await run("ffplay", [
    "-nodisp",
    "-autoexit",
    "-loglevel",
    "error",
    streamUrl,
  ]);
}

async function checkForCommand() {
  try {
    const response = await fetch(endpoint);
    const data = await response.json();

    if (data?.command !== "PLAY") {
      return;
    }

    console.log("PLAY received");
    await playYouTube(data.url);

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
