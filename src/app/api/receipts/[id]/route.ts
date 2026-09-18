import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { presignReceiptGet } from "@/lib/r2";

/**
 * The only way to look at a receipt.
 *
 * The bucket is private and has no public domain, so every read is checked here first
 * and then redirected to a five-minute signed URL. Three things make that hold up:
 * the session has to exist, the receipt has to belong to the viewer's own household,
 * and the signature dies almost immediately, so a URL scraped out of devtools is not
 * a durable leak.
 *
 * The service worker never sees this: `public/sw.js` bails out of `/api/` before its
 * caching logic runs, so one household's evidence cannot end up in another's cache.
 */
export async function GET(_request: Request, context: RouteContext<"/api/receipts/[id]">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return Response.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { householdId: true } });
  if (!user?.householdId) {
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }

  const { id } = await context.params;
  // The householdId in the filter is the authorization check, matching how the debt
  // actions scope every query. Another household's id is reported as missing rather
  // than as forbidden, so this cannot be used to probe which receipts exist.
  const receipt = await prisma.receipt.findFirst({
    where: { id, householdId: user.householdId, status: "STORED" },
    select: { key: true },
  });
  if (!receipt) {
    return Response.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }

  // Built by hand rather than with `Response.redirect`, whose response is immutable
  // and so cannot carry the no-store. Without it an intermediary would be free to
  // cache the 302 and hand one household's signed URL to the next viewer.
  return new Response(null, {
    status: 302,
    headers: {
      Location: await presignReceiptGet(receipt.key),
      "Cache-Control": "private, no-store",
    },
  });
}
