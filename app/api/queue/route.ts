import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, url, title, position, created_at")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Queue fetch failed:", error);

    return Response.json(
      { error: "Could not load queue.", items: [] },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { items: data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: { url?: unknown } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return Response.json({ error: "Missing YouTube URL." }, { status: 400 });
  }

  const url = body.url.trim();
  const title = await getYouTubeTitle(url);

  if (!title) {
    return Response.json(
      { error: "Could not read that YouTube link." },
      { status: 400 },
    );
  }

  const { data: lastItem, error: positionError } = await supabase
    .from("queue_items")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (positionError) {
    console.error("Queue position lookup failed:", positionError);

    return Response.json(
      { error: "Could not choose a queue position." },
      { status: 500 },
    );
  }

  const position =
    typeof lastItem?.position === "number" ? lastItem.position + 1 : 1;

  const { data, error } = await supabase
    .from("queue_items")
    .insert({ url, title, position })
    .select("id, url, title, position, created_at")
    .single();

  if (error) {
    console.error("Queue item insert failed:", error);

    return Response.json(
      { error: "Could not save that song to the queue." },
      { status: 500 },
    );
  }

  return Response.json({ item: data });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();

  if (!id) {
    return Response.json({ error: "Missing queue item." }, { status: 400 });
  }

  const { error } = await supabase.from("queue_items").delete().eq("id", id);

  if (error) {
    console.error("Queue item delete failed:", error);

    return Response.json(
      { error: "Could not remove that song." },
      { status: 500 },
    );
  }

  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function getYouTubeTitle(url: string) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );

    if (!response.ok) {
      console.error("YouTube oEmbed failed:", {
        status: response.status,
        statusText: response.statusText,
        url,
      });

      return null;
    }

    const data = (await response.json()) as { title?: unknown };

    if (typeof data.title !== "string" || !data.title.trim()) {
      console.error("YouTube oEmbed response did not include a title:", data);

      return null;
    }

    return data.title.trim();
  } catch (error) {
    console.error("YouTube oEmbed request failed:", error);

    return null;
  }
}
