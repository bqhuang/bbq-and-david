"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("");
  const [playbackStatus, setPlaybackStatus] = useState("stopped");
  const [url, setUrl] = useState("");

  async function refreshStatus() {
    try {
      const response = await fetch("/api/command");
      const data = await response.json();
      setPlaybackStatus(data.status === "playing" ? "playing" : "stopped");
    } catch {
      setPlaybackStatus("stopped");
    }
  }

  useEffect(() => {
    refreshStatus();

    const interval = setInterval(refreshStatus, 5_000);

    return () => clearInterval(interval);
  }, []);

  async function play() {
    setStatus("Sending...");

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "PLAY", url }),
      });

      setStatus(response.ok ? "Sent" : "Failed");
    } catch {
      setStatus("Failed");
    }
  }

  async function stop() {
    setStatus("Sending...");

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "STOP" }),
      });

      setStatus(response.ok ? "Sent" : "Failed");
    } catch {
      setStatus("Failed");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex w-full max-w-xs flex-col items-center gap-3 px-6">
        <div className="text-2xl">❤️</div>
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="Paste a YouTube URL"
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <div className="grid w-full grid-cols-2 gap-2">
          <button
            type="button"
            onClick={play}
            className="cursor-pointer rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700"
          >
            Play
          </button>
          <button
            type="button"
            onClick={stop}
            className="cursor-pointer rounded-lg border border-neutral-200 px-4 py-2 text-sm transition hover:bg-neutral-50"
          >
            Stop
          </button>
        </div>
        <div className="text-xs text-neutral-500">
          Status: {playbackStatus === "playing" ? "Playing" : "Stopped"}
        </div>
        {status ? <div className="text-xs text-neutral-500">{status}</div> : null}
      </div>
    </main>
  );
}
