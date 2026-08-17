export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center text-xl font-semibold tracking-tight">kodely</div>
        {children}
      </div>
    </div>
  );
}
