import { spawn } from "node:child_process";

const endpoint = "https://bbq-and-david.vercel.app/api/command";
const intervalMs = 10_000;

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

async function playYouTube(url) {
  if (!url) {
    throw new Error("PLAY command did not include a YouTube URL.");
  }

  console.log(`URL: ${url}`);
  await playWithMpv(url);
}

async function playWithMpv(url) {
  console.log("Starting YouTube audio stream...");

  try {
    await new Promise((resolve, reject) => {
      const player = spawn("mpv", ["--no-video", "--really-quiet", url], {
        stdio: ["ignore", "ignore", "pipe"],
      });

      let stderr = "";

      player.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      player.on("error", reject);
      player.on("close", (code) => {
        if (code) {
          reject(new Error(stderr.trim() || `mpv exited with code ${code}`));
          return;
        }

        console.log("Playback finished");
        resolve();
      });
    });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }

    console.warn("mpv is not available; falling back to yt-dlp and ffplay.");
    await playWithYtDlpAndFfplay(url);
  }
}

async function playWithYtDlpAndFfplay(url) {
  console.log("Starting YouTube audio stream...");

  await new Promise((resolve, reject) => {
    const ytdlp = spawn(
      "python3",
      [
        "-m",
        "yt_dlp",
        "--no-playlist",
        "-f",
        "bestaudio[ext=m4a]/bestaudio/best",
        "-o",
        "-",
        url,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const ffplay = spawn(
      "ffplay",
      ["-nodisp", "-autoexit", "-loglevel", "warning", "-i", "pipe:0"],
      { stdio: ["pipe", "ignore", "pipe"] },
    );

    let settled = false;
    let ytdlpError = "";
    let ffplayError = "";
    let ytdlpCode = null;
    let ffplayCode = null;

    function fail(error) {
      if (settled) {
        return;
      }

      settled = true;
      ytdlp.kill();
      ffplay.kill();
      reject(error);
    }

    function finishIfReady() {
      if (settled || ytdlpCode === null || ffplayCode === null) {
        return;
      }

      settled = true;

      if (ytdlpCode || ffplayCode) {
        reject(
          new Error(
            ytdlpError.trim() ||
              ffplayError.trim() ||
              `yt-dlp exited with code ${ytdlpCode}, ffplay exited with code ${ffplayCode}`,
          ),
        );
        return;
      }

      console.log("Playback finished");
      resolve();
    }

    ytdlp.stdout.pipe(ffplay.stdin);

    ytdlp.stderr.on("data", (chunk) => {
      ytdlpError += chunk;
    });

    ffplay.stderr.on("data", (chunk) => {
      ffplayError += chunk;
    });

    ytdlp.on("error", fail);
    ffplay.on("error", fail);

    ytdlp.on("close", (code) => {
      ytdlpCode = code ?? 0;
      finishIfReady();
    });

    ffplay.on("close", (code) => {
      ffplayCode = code ?? 0;
      finishIfReady();
    });

    ffplay.stdin.on("error", () => {});
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
    await clearCommand();

    try {
      await playYouTube(data.url);
    } catch (error) {
      console.warn(`Playback failed: ${readableError(error)}`);
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
