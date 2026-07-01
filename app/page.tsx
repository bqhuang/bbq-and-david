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

type QueueItem = {
  id: string;
  url: string;
  title: string;
  position: number;
};

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
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);
  const [hasJoinedMusicRoom, setHasJoinedMusicRoom] = useState(false);
  const [playbackStatus, setPlaybackStatus] = useState("stopped");
  const [playbackUrl, setPlaybackUrl] = useState("");
  const [pendingAction, setPendingAction] = useState<"play" | "stop" | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [queueMessage, setQueueMessage] = useState("");
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

  async function refreshStatus() {
    try {
      const response = await fetch("/api/command");
      const data = await response.json();
      const nextStatus = data.status === "playing" ? "playing" : "stopped";

      setPlaybackStatus(nextStatus);
      setPlaybackUrl((currentUrl) => {
        if (nextStatus !== "playing") {
          return "";
        }

        return typeof data.url === "string" && data.url ? data.url : currentUrl;
      });
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
    } catch {
      setPlaybackStatus("stopped");
      setPlaybackUrl("");
    }
  }

  useEffect(() => {
    if (!hasJoinedMusicRoom) {
      return;
    }

    refreshStatus();
    refreshQueue();

    const channel = supabase
      .channel("queue-items")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_items",
        },
        () => {
          void refreshQueue();
        },
      )
      .subscribe();

    const interval = setInterval(refreshStatus, 5_000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [hasJoinedMusicRoom]);

  async function refreshQueue() {
    try {
      const response = await fetch("/api/queue");
      const data = await response.json();

      setQueueItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setQueueItems([]);
    }
  }

  async function addSong() {
    if (!url.trim() || isAdding) {
      return;
    }

    setIsAdding(true);
    setQueueMessage("");

    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;

      if (!response.ok) {
        setQueueMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not add that song. Please try another YouTube link.",
        );
        return;
      }

      setQueueMessage("");
      setUrl("");
      await refreshQueue();
    } catch {
      setQueueMessage("Could not add that song. Please try again.");
    } finally {
      setIsAdding(false);
    }
  }

  async function removeSong(id: string) {
    const previousItems = queueItems;

    setQueueMessage("");
    setQueueItems((items) => items.filter((item) => item.id !== id));

    try {
      const response = await fetch(`/api/queue?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;

      if (!response.ok) {
        setQueueItems(previousItems);
        setQueueMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not remove that song.",
        );
      }
    } catch {
      setQueueItems(previousItems);
      setQueueMessage("Could not remove that song.");
    }
  }

  async function play() {
    const firstSong = queueItems[0];

    if (!firstSong) {
      setQueueMessage("Add a song first.");
      return;
    }

    setPendingAction("play");
    setPlaybackUrl(firstSong.url);
    void playInBrowser(firstSong.url);

    try {
      await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "PLAY",
          url: firstSong.url,
          status: "playing",
        }),
      });

    } catch {}
  }

  async function stop() {
    setPendingAction("stop");
    setPlaybackUrl("");
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
  const hasQueuedSongs = queueItems.length > 0;
  const buttonLabel = isLoading
    ? "Loading"
    : playbackStatus === "playing"
      ? "Stop"
      : "Play";

  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex w-full max-w-xs flex-col items-center gap-3 px-6">
          <div className="text-center text-2xl">❤️</div>
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Paste a YouTube URL"
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          <button
            type="button"
            disabled={isAdding}
            onClick={addSong}
            className="w-full cursor-pointer rounded-lg border border-neutral-200 px-4 py-2 text-sm transition hover:bg-neutral-50 disabled:cursor-default disabled:opacity-70"
          >
            {isAdding ? "Adding" : "Add"}
          </button>
          <div className="w-full text-sm">
            <div className="mb-2 text-xs text-neutral-500">Queue</div>
            {queueItems.length ? (
              <ol className="max-h-[8.875rem] space-y-1 overflow-y-auto pr-1">
                {queueItems.map((item) => {
                  // The animated queue icon follows playback status, not loading state.
                  const isCurrentSong =
                    playbackStatus === "playing" && item.url === playbackUrl;

                  return (
                    <li
                      key={item.id}
                      className="group grid max-w-full grid-cols-[1.25rem_minmax(0,1fr)_1.25rem] items-center rounded-md px-1 py-1 leading-5 text-neutral-800 transition-colors duration-200 hover:bg-neutral-100/70"
                    >
                      <span className="flex h-5 items-center justify-center text-sm text-current">
                        {isCurrentSong ? (
                          <span
                            aria-hidden="true"
                            className="audio-bars is-playing"
                          >
                            <span />
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : (
                          "♪"
                        )}
                      </span>
                      <span className="truncate">{item.title}</span>
                      <button
                        type="button"
                        aria-label="Remove song"
                        onClick={() => removeSong(item.id)}
                        className="h-5 cursor-pointer text-center text-sm font-light leading-5 text-current opacity-0 transition-opacity duration-200 focus:opacity-100 focus:outline-none group-hover:opacity-100"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="text-xs text-neutral-500">Add a song first.</div>
            )}
          </div>
          <button
            type="button"
            disabled={isLoading || (!isPlaying && !hasQueuedSongs)}
            onClick={togglePlayback}
            className="w-full cursor-pointer rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white transition hover:bg-neutral-700 disabled:cursor-default disabled:opacity-80"
          >
            {buttonLabel}
          </button>
          {queueMessage ? (
            <div className="text-xs text-neutral-500">{queueMessage}</div>
          ) : null}
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
