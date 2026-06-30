import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

const audioFile = "/Users/bingqing/bbq-and-david/bangbangbangbang.m4a";

try {
  await access(audioFile, constants.F_OK);
} catch {
  console.error(`Could not find the audio file at:\n${audioFile}`);
  process.exit(1);
}

const player = spawn("/usr/bin/afplay", [audioFile], {
  stdio: ["ignore", "inherit", "pipe"],
});

let playbackError = "";

player.stderr.on("data", (chunk) => {
  playbackError += chunk;
});

player.on("error", (error) => {
  console.error(`Could not start playback: ${error.message}`);
  process.exit(1);
});

player.on("close", (code) => {
  if (code) {
    console.error("Could not play the audio file with afplay.");

    if (playbackError.trim()) {
      console.error(playbackError.trim());
    }
  }

  process.exit(code ?? 0);
});
