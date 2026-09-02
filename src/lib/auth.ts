import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await prisma.household.create({
            data: {
              name: `${user.name}'s household`,
              inviteCode: randomBytes(4).toString("hex").toUpperCase(),
              members: { connect: { id: user.id } },
            },
          });
        },
      },
    },
  },
});
