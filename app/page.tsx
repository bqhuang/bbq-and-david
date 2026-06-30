"use client";

import { useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("");

  async function playWakeUpSong() {
    setStatus("Sending...");

    try {
      const response = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "PLAY" }),
      });

      setStatus(response.ok ? "Sent ❤️" : "Failed");
    } catch {
      setStatus("Failed");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-2">
        <div>❤️</div>
        <button type="button" onClick={playWakeUpSong}>
          Play wake-up song
        </button>
        {status ? <div className="text-xs">{status}</div> : null}
      </div>
    </main>
  );
}
