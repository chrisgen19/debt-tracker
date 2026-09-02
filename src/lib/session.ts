import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const getCurrentUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    include: { household: { include: { members: true } } },
  });
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user?.householdId || !user.household) redirect("/login");
  return user;
}
