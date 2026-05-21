import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:py-20">
      <Link
        href="/"
        className="brand-mark mb-10 text-5xl text-[var(--text-strong)] transition-opacity hover:opacity-80"
      >
        Bite
      </Link>
      <div className="card w-full max-w-sm p-6 sm:p-8">{children}</div>
    </div>
  );
}
