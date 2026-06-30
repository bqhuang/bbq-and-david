let command: "PLAY" | null = null;

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { command },
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

  command = body.command === "PLAY" ? "PLAY" : null;

  return Response.json(
    { command },
    { headers: { "Cache-Control": "no-store" } },
  );
}
