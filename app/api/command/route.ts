import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("command_state")
    .select("command, url")
    .eq("id", "main")
    .single();

  if (error) {
    return Response.json(
      { command: null, url: null },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { command: data.command, url: data.url },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: { command?: unknown; url?: unknown } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const command = body.command === "PLAY" ? "PLAY" : null;
  const url = command === "PLAY" && typeof body.url === "string" ? body.url : null;

  const { data, error } = await supabase
    .from("command_state")
    .update({ command, url, updated_at: new Date().toISOString() })
    .eq("id", "main")
    .select("command, url")
    .single();

  if (error) {
    return Response.json(
      { command: null, url: null },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { command: data.command, url: data.url },
    { headers: { "Cache-Control": "no-store" } },
  );
}
