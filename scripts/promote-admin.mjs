// Promotes a Kodely user to ADMIN so they can reach /admin — or demotes one.
// Deliberately NOT an HTTP endpoint — a self-serve "become admin" API would
// be a privilege-escalation hole. Run this directly on the box instead:
//   node scripts/promote-admin.mjs someone@example.com
//   node scripts/promote-admin.mjs someone@example.com --revoke
//
// Run it against the database you mean: DATABASE_URL differs per environment,
// so promoting yourself locally does nothing on staging or prod.
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
const revoke = process.argv.includes("--revoke");

if (!email) {
  console.error("Usage: node scripts/promote-admin.mjs <email> [--revoke]");
  process.exit(1);
}

const db = new PrismaClient();
try {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }

  const role = revoke ? "CUSTOMER" : "ADMIN";
  if (user.role === role) {
    console.log(`${email} is already ${role}. Nothing to do.`);
  } else {
    await db.user.update({ where: { id: user.id }, data: { role } });
    console.log(`${email}: ${user.role} -> ${role}`);
  }

  // Always print the resulting roster. Who can see cost, margin and customer
  // prompts should never be a thing you have to go and look up separately.
  const admins = await db.user.findMany({
    where: { role: "ADMIN" },
    select: { email: true },
    orderBy: { email: "asc" },
  });
  console.log(`\nAdmins now (${admins.length}): ${admins.map((a) => a.email).join(", ") || "none"}`);
} finally {
  await db.$disconnect();
}
