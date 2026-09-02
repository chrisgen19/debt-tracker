/**
 * Container healthcheck. Deliberately touches nothing but the web server: a
 * database blip should page us through the database's own monitoring, not
 * restart a perfectly healthy app container.
 */
export function GET() {
  return Response.json({ status: "ok" });
}
