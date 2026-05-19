import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:py-20">
      <Link href="/" className="mb-8 text-3xl font-bold tracking-tight">
        Bite
      </Link>
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        {children}
      </div>
    </div>
  );
}
