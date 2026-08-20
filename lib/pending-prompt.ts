export const PENDING_PROMPT_KEY = "kodely:pending_prompt";
// A reference image attached on the homepage before signing up, carried
// through the auth wall the same way the prompt text is. Stored as a data
// URL (already downscaled client-side — see PromptHero) so it comfortably
// fits sessionStorage's per-origin limit.
export const PENDING_PROMPT_IMAGE_KEY = "kodely:pending_prompt_image";

function deriveName(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  return trimmed.length > 60 ? trimmed.slice(0, 57) + "…" : trimmed || "New site";
}

/**
 * After a successful login/signup, sends the user straight into a new
 * project pre-loaded with whatever they typed on the homepage before hitting
 * the auth wall, instead of losing it and dropping them on an empty
 * dashboard. Returns the path to navigate to — "/dashboard" if there was
 * nothing pending or project creation failed for any reason.
 */
export async function destinationAfterAuth(): Promise<string> {
  let prompt: string | null = null;
  try {
    prompt = sessionStorage.getItem(PENDING_PROMPT_KEY);
  } catch {}
  if (!prompt) return "/dashboard";

  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: deriveName(prompt) }),
    });
    const body = await res.json();
    if (!res.ok || !body?.project?.id) return "/dashboard";
    return `/projects/${body.project.id}`;
  } catch {
    return "/dashboard";
  }
}
