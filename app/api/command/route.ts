import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("command_state")
    .select("command")
    .eq("id", "main")
    .single();

  if (error) {
    return Response.json(
      { command: null },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { command: data.command },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: { command?: unknown } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const command = body.command === "PLAY" ? "PLAY" : null;

  const { data, error } = await supabase
    .from("command_state")
    .update({ command, updated_at: new Date().toISOString() })
    .eq("id", "main")
    .select("command")
    .single();

  if (error) {
    return Response.json(
      { command: null },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { command: data.command },
    { headers: { "Cache-Control": "no-store" } },
  );
}
