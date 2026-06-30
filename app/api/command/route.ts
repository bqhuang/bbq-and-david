import { supabase } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("command_state")
    .select("command, url, status")
    .eq("id", "main")
    .single();

  if (error) {
    return Response.json(
      { command: null, url: null, status: "stopped" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { command: data.command, url: data.url, status: data.status ?? "stopped" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  let body: { command?: unknown; url?: unknown; status?: unknown } = {};

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const command =
    body.command === "PLAY" || body.command === "STOP" ? body.command : null;
  const url = command === "PLAY" && typeof body.url === "string" ? body.url : null;
  const status =
    body.status === "playing" || body.status === "stopped"
      ? body.status
      : undefined;

  const update: {
    command: "PLAY" | "STOP" | null;
    url: string | null;
    status?: "playing" | "stopped";
    updated_at: string;
  } = {
    command,
    url,
    updated_at: new Date().toISOString(),
  };

  if (status) {
    update.status = status;
  }

  const { data, error } = await supabase
    .from("command_state")
    .update(update)
    .eq("id", "main")
    .select("command, url, status")
    .single();

  if (error) {
    return Response.json(
      { command: null, url: null, status: "stopped" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { command: data.command, url: data.url, status: data.status ?? "stopped" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
