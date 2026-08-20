function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.6c-.5 3-2.2 5.5-4.6 7.2l7.2 5.6c4.2-3.9 6.7-9.6 6.7-17.3z" />
      <path fill="#FBBC05" d="M10.5 19.3a14.5 14.5 0 0 0 0 9.4l-7.9 6.1a24 24 0 0 1 0-21.6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.7 2.2-8.7 2.2-6.3 0-11.6-3.5-13.5-9.6l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Links straight to the OAuth start route — inert (redirects back with
 * ?error=google_not_configured) until real Google credentials are set. */
export function GoogleButton({ label }: { label: string }) {
  return (
    <a
      href="/api/auth/google/start"
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900"
    >
      <GoogleG />
      {label}
    </a>
  );
}
