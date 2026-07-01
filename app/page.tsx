"use client";

import { useEffect, useRef, useState } from "react";

type YouTubePlayer = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  stopVideo: () => void;
};

type YouTubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    height: string;
    width: string;
    playerVars: Record<string, number>;
  },
) => YouTubePlayer;

declare global {
  interface Window {
    YT?: {
      Player: YouTubePlayerConstructor;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => resolve();

      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    });
  }

  return youtubeApiPromise;
}

function getYouTubeVideoId(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.hostname.includes("youtu.be")) {
      return parsedUrl.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (parsedUrl.pathname.startsWith("/shorts/")) {
      return parsedUrl.pathname.split("/").filter(Boolean)[1] ?? null;
    }

    return parsedUrl.searchParams.get("v");
  } catch {
    return null;
  }
}

export default function Home() {
  const [status, setStatus] = useState("");
  const [playbackStatus, setPlaybackStatus] = useState("stopped");
  const [browserPlaybackEnabled, setBrowserPlaybackEnabled] = useState(false);
  const [browserMessage, setBrowserMessage] = useState("");
  const [url, setUrl] = useState("");
  const playerRootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const enabledRef = useRef(false);
  const currentVideoIdRef = useRef("");

  async function ensurePlayer() {
    if (playerRef.current || !playerRootRef.current) {
      return playerRef.current;
    }

    await loadYouTubeApi();

    if (!window.YT?.Player) {
      throw new Error("YouTube player is not ready.");
    }

    playerRef.current = new window.YT.Player(playerRootRef.current, {
      height: "1",
      width: "1",
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        playsinline: 1,
      },
    });

    return playerRef.current;
  }

  async function syncBrowserPlayback(nextStatus: string, nextUrl: unknown) {
    if (nextStatus !== "playing") {
      playerRef.current?.stopVideo();
      currentVideoIdRef.current = "";
      return;
    }

    if (typeof nextUrl !== "string") {
      return;
    }

    const videoId = getYouTubeVideoId(nextUrl);

    if (!videoId) {
      return;
    }

    if (!enabledRef.current) {
      setBrowserMessage("Click Enable browser playback first.");
      return;
    }

    try {
      const player = await ensurePlayer();

      if (!player) {
        return;
      }

      setBrowserMessage("");

      if (currentVideoIdRef.current !== videoId) {
        currentVideoIdRef.current = videoId;
        player.loadVideoById(videoId);
        return;
      }

      player.playVideo();
    } catch {
      setBrowserMessage("Click Enable browser playback first.");
    }
  }

  async function refreshStatus() {
    try {
      const response = await fetch("/api/command");
      const data = await response.json();
      const nextStatus = data.status === "playing" ? "playing" : "stopped";

      setPlaybackStatus(nextStatus);
      await syncBrowserPlayback(nextStatus, data.url);
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

  async function enableBrowserPlayback() {
    enabledRef.current = true;
    setBrowserPlaybackEnabled(true);
    setBrowserMessage("Browser playback enabled");

    try {
      await ensurePlayer();
      await refreshStatus();
    } catch {
      setBrowserMessage("Click Enable browser playback first.");
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
        <button
          type="button"
          onClick={enableBrowserPlayback}
          className="w-full cursor-pointer rounded-lg border border-neutral-200 px-4 py-2 text-sm transition hover:bg-neutral-50"
        >
          {browserPlaybackEnabled
            ? "Browser playback enabled"
            : "Enable browser playback"}
        </button>
        <div className="text-xs text-neutral-500">
          Status: {playbackStatus === "playing" ? "Playing" : "Stopped"}
        </div>
        {browserMessage ? (
          <div className="text-xs text-neutral-500">{browserMessage}</div>
        ) : null}
        {status ? <div className="text-xs text-neutral-500">{status}</div> : null}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
      >
        <div ref={playerRootRef} />
      </div>
    </main>
  );
}
