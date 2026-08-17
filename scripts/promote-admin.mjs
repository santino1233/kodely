// Promotes a Kodely user to ADMIN so they can reach /admin.
// Deliberately NOT an HTTP endpoint — a self-serve "become admin" API would
// be a privilege-escalation hole. Run this directly on the box instead:
//   node scripts/promote-admin.mjs someone@example.com
import { PrismaClient } from "@prisma/client";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/promote-admin.mjs <email>");
  process.exit(1);
}

const db = new PrismaClient();
const user = await db.user.findUnique({ where: { email } });
if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}

await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
console.log(`${email} is now ADMIN.`);
await db.$disconnect();
