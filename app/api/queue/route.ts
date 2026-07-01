import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("queue_items")
    .select("id, url, title, position, created_at")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return Response.json(
      { items: [] },
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
    return Response.json({ error: "Could not read YouTube title." }, { status: 400 });
  }

  const { data: lastItem } = await supabase
    .from("queue_items")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position =
    typeof lastItem?.position === "number" ? lastItem.position + 1 : 1;

  const { data, error } = await supabase
    .from("queue_items")
    .insert({ url, title, position })
    .select("id, url, title, position, created_at")
    .single();

  if (error) {
    return Response.json({ error: "Could not add song." }, { status: 500 });
  }

  return Response.json({ item: data });
}

async function getYouTubeTitle(url: string) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { title?: unknown };

    return typeof data.title === "string" ? data.title : null;
  } catch {
    return null;
  }
}
