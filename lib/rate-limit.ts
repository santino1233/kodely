import { db } from "./db";

// Credits already cap spend per build, but nothing stops a broken or
// malicious client from firing many rapid requests before a human notices —
// and a free, unmetered *.kodely.site subdomain is a spam/phishing vector
// independent of credit spend. These are coarse, cheap safety nets, not a
// content-moderation system (there is no classifier here — a page can still
// be abusive content and pass both checks; that's a separate, harder problem
// left for a dedicated moderation pass, not faked here with a weak heuristic).

const GENERATE_LIMIT = 20; // per user, per rolling hour
const PUBLISH_LIMIT = 15; // new (first-time) publishes per user, per rolling day

export async function checkGenerateRateLimit(
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const since = new Date(Date.now() - 60 * 60_000);
  const count = await db.build.count({
    where: { project: { userId }, createdAt: { gte: since } },
  });
  if (count < GENERATE_LIMIT) return { allowed: true };
  return { allowed: false, retryAfterSeconds: 3600 };
}

export async function checkPublishRateLimit(
  userId: string,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  // Counts DISTINCT projects touched by a publish in the window, not publish
  // events — republishing the same project repeatedly still counts once.
  // That's the right shape: the abuse case is many distinct spam subdomains,
  // not heavy iteration on one real site (which credits already gate).
  const count = await db.project.count({
    where: { userId, publishedAt: { gte: since } },
  });
  if (count < PUBLISH_LIMIT) return { allowed: true };
  return { allowed: false, retryAfterSeconds: 86_400 };
}
