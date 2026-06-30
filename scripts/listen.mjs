import { spawn } from "node:child_process";

const endpoint = "https://bbq-and-david.vercel.app/api/command";
const intervalMs = 10_000;

let currentPlayer = null;

function readableError(error) {
  return error instanceof Error ? error.message : String(error);
}

async function clearCommand() {
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: null }),
  });

  console.log("Command cleared");
}

function stopPlayback() {
  if (!currentPlayer) {
    return;
  }

  const player = currentPlayer;
  currentPlayer = null;
  player.kill("SIGTERM");
}

function startPlayback(url) {
  if (!url) {
    throw new Error("PLAY command did not include a YouTube URL.");
  }

  stopPlayback();

  console.log(`URL: ${url}`);
  console.log("Starting YouTube audio stream...");

  const player = spawn("mpv", ["--no-video", "--really-quiet", url], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  currentPlayer = player;

  let stderr = "";

  player.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  player.on("error", (error) => {
    if (currentPlayer === player) {
      currentPlayer = null;
    }

    console.warn(`Playback failed: ${readableError(error)}`);
  });

  player.on("close", (code, signal) => {
    if (currentPlayer === player) {
      currentPlayer = null;
    }

    if (signal === "SIGTERM") {
      return;
    }

    if (code) {
      console.warn(
        `Playback failed: ${stderr.trim() || `mpv exited with code ${code}`}`,
      );
      return;
    }

    console.log("Playback finished");
  });
}

async function checkForCommand() {
  try {
    const response = await fetch(endpoint);
    const data = await response.json();

    if (data?.command === "PLAY") {
      console.log("PLAY received");
      await clearCommand();
      startPlayback(data.url);
      return;
    }

    if (data?.command === "STOP") {
      console.log("STOP received");
      await clearCommand();
      stopPlayback();
      console.log("Playback stopped");
    }
  } catch (error) {
    console.warn(`Warning: ${readableError(error)}`);
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
