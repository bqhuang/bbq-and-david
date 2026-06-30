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

async function setPlaybackStatus(status) {
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: null, status }),
  });
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
  setPlaybackStatus("playing").catch((error) => {
    console.warn(`Warning: ${readableError(error)}`);
  });

  let stderr = "";

  player.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  player.on("error", (error) => {
    if (currentPlayer !== player) {
      return;
    }

    currentPlayer = null;
    console.warn(`Playback failed: ${readableError(error)}`);
    setPlaybackStatus("stopped").catch((statusError) => {
      console.warn(`Warning: ${readableError(statusError)}`);
    });
  });

  player.on("close", (code, signal) => {
    if (currentPlayer !== player) {
      return;
    }

    currentPlayer = null;

    if (signal === "SIGTERM") {
      return;
    }

    if (code) {
      console.warn(
        `Playback failed: ${stderr.trim() || `mpv exited with code ${code}`}`,
      );
      setPlaybackStatus("stopped").catch((error) => {
        console.warn(`Warning: ${readableError(error)}`);
      });
      return;
    }

    console.log("Playback finished");
    setPlaybackStatus("stopped").catch((error) => {
      console.warn(`Warning: ${readableError(error)}`);
    });
  });
}

async function checkForCommand() {
  try {
    const response = await fetch(endpoint);
    const data = await response.json();

    if (data?.command === "PLAY") {
      console.log("PLAY received");
      await clearCommand();

      try {
        startPlayback(data.url);
      } catch (error) {
        console.warn(`Playback failed: ${readableError(error)}`);
        await setPlaybackStatus("stopped");
      }

      return;
    }

    if (data?.command === "STOP") {
      console.log("STOP received");
      await clearCommand();
      stopPlayback();
      await setPlaybackStatus("stopped");
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
