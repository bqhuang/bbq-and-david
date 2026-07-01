"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type YouTubePlayer = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
};

type YouTubePlayerConstructor = new (
  element: HTMLElement,
  options: {
    height: string;
    width: string;
    playerVars: Record<string, number>;
    events?: {
      onReady?: () => void;
      onStateChange?: (event: { data: number }) => void;
      onError?: () => void;
    };
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

type CommandState = {
  command?: unknown;
  url?: unknown;
  status?: unknown;
};

export default function Home() {
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);
  const [hasJoinedMusicRoom, setHasJoinedMusicRoom] = useState(false);
  const [playbackStatus, setPlaybackStatus] = useState("stopped");
  const [pendingAction, setPendingAction] = useState<"play" | "stop" | null>(null);
  const [url, setUrl] = useState("");
  const playerRootRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const enabledRef = useRef(false);
  const playerReadyRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const currentVideoIdRef = useRef("");

  useEffect(() => {
    const hasJoined = localStorage.getItem("musicRoomJoined") === "true";

    if (hasJoined) {
      enabledRef.current = true;
    }

    setHasJoinedMusicRoom(hasJoined);
    setHasCheckedOnboarding(true);
  }, []);

  async function ensurePlayer(): Promise<YouTubePlayer | null> {
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
      events: {
        onReady: () => {
          playerReadyRef.current = true;

          if (pendingPlayRef.current) {
            pendingPlayRef.current = false;
            playerRef.current?.playVideo();
          }
        },
      },
    });

    return playerRef.current;
  }

  async function playInBrowser(nextUrl: string) {
    const videoId = getYouTubeVideoId(nextUrl);

    if (!videoId) {
      return;
    }

    if (!enabledRef.current) {
      return;
    }

    try {
      const player = await ensurePlayer();

      if (!player) {
        return;
      }

      if (currentVideoIdRef.current !== videoId) {
        currentVideoIdRef.current = videoId;
        player.loadVideoById(videoId);

        if (playerReadyRef.current) {
          pendingPlayRef.current = false;
          player.playVideo();
          return;
        }

        pendingPlayRef.current = true;
        return;
      }

      if (!playerReadyRef.current) {
        pendingPlayRef.current = true;
        return;
      }

      pendingPlayRef.current = false;
      player.playVideo();
    } catch {}
  }

  function stopBrowserPlayback() {
    pendingPlayRef.current = false;
    currentVideoIdRef.current = "";
    playerRef.current?.pauseVideo();
    playerRef.current?.stopVideo();
  }

  async function syncBrowserPlayback(nextStatus: string, nextUrl: unknown) {
    if (nextStatus !== "playing") {
      stopBrowserPlayback();
      return;
    }

    if (typeof nextUrl !== "string") {
      return;
    }

    await playInBrowser(nextUrl);
  }

  async function applyCommandState(data: CommandState) {
    const nextStatus = data.status === "playing" ? "playing" : "stopped";

    setPlaybackStatus(nextStatus);
    setPendingAction((current) => {
      if (current === "play" && nextStatus === "playing") {
        return null;
      }

      if (current === "stop" && nextStatus === "stopped") {
        return null;
      }

      return current;
    });
    await syncBrowserPlayback(nextStatus, data.url);
  }

  async function refreshStatus() {
    try {
      const response = await fetch("/api/command");
      const data = await response.json();

      await applyCommandState(data);
    } catch {
      setPlaybackStatus("stopped");
    }
  }

  useEffect(() => {
    if (!hasJoinedMusicRoom) {
      return;
    }

    refreshStatus();

    const channel = supabase
      .channel("command-state-main")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "command_state",
          filter: "id=eq.main",
        },
        (payload) => {
          void applyCommandState(payload.new as CommandState);
        },
      )
      .subscribe();

    const interval = setInterval(refreshStatus, 30_000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [hasJoinedMusicRoom]);

  async function play() {
    setPendingAction("play");
    void playInBrowser(url);

    try {
      await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "PLAY", url, status: "playing" }),
      });

    } catch {}
  }

  async function stop() {
    setPendingAction("stop");
    stopBrowserPlayback();

    try {
      await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "STOP", status: "stopped" }),
      });

    } catch {}
  }

  async function togglePlayback() {
    if (pendingAction) {
      return;
    }

    if (playbackStatus === "playing") {
      await stop();
      return;
    }

    await play();
  }

  async function enableBrowserPlayback() {
    enabledRef.current = true;

    try {
      await ensurePlayer();
      await refreshStatus();
    } catch {}
  }

  async function joinMusicRoom() {
    await enableBrowserPlayback();
    localStorage.setItem("musicRoomJoined", "true");
    setHasJoinedMusicRoom(true);
  }

  if (!hasCheckedOnboarding) {
    return null;
  }

  if (!hasJoinedMusicRoom) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <button
          type="button"
          onClick={joinMusicRoom}
          className="cursor-pointer rounded-lg bg-neutral-900 px-5 py-3 text-sm text-white transition hover:bg-neutral-700"
        >
          ❤️ Listen Together
        </button>
      </main>
    );
  }

  const isLoading = pendingAction !== null;
  const isPlaying = playbackStatus === "playing" && !isLoading;
  const buttonLabel = isLoading
    ? "Loading"
    : playbackStatus === "playing"
      ? "Stop"
      : "Play";

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
        <button
          type="button"
          disabled={isLoading}
          onClick={togglePlayback}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700 disabled:cursor-default disabled:opacity-80"
        >
          {isLoading ? (
            <span aria-hidden="true" className="audio-spinner" />
          ) : (
            <span
              aria-hidden="true"
              className={`audio-bars ${isPlaying ? "is-playing" : ""}`}
            >
              <span />
              <span />
              <span />
              <span />
            </span>
          )}
          {buttonLabel}
        </button>
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
