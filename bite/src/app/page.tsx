import Link from "next/link";
import { redirect } from "next/navigation";
import { BotIcon, UsersIcon, UtensilsIcon } from "@/components/ui/icons";
import { getUser } from "@/lib/supabase/server";

const FEATURES = [
  {
    title: "餐厅记录",
    desc: "朋友推荐、小红书种草的店，一条 list 收好",
    icon: <UtensilsIcon size={16} />,
  },
  {
    title: "AI 决策",
    desc: "纠结的时候，让 AI 按场景帮你挑一家",
    icon: <BotIcon size={16} />,
  },
  {
    title: "朋友共享",
    desc: "和朋友一起维护清单，谁想去哪一目了然",
    icon: <UsersIcon size={16} />,
  },
];

export default async function HomePage() {
  const user = await getUser();
  if (user) {
    redirect("/lists");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="brand-mark text-6xl">Bite</h1>
          <p className="heading-display mt-7 text-[1.75rem] leading-tight text-[var(--text-strong)] sm:text-[2rem]">
            朋友推荐的店不再忘，
            <br />
            今晚吃哪
            <em className="italic text-[var(--primary)]">不再纠结</em>
          </p>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            餐厅记录 · AI 决策 · 朋友共享
          </p>
        </div>

        <ul className="mt-10 space-y-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="card flex items-center gap-4 px-5 py-4 text-left"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-soft-text)]">
                {feature.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-strong)]">
                  {feature.title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {feature.desc}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex w-full flex-col gap-3">
          <Link href="/login" className="btn-primary py-3.5 text-base">
            登录
          </Link>
          <Link href="/signup" className="btn-secondary py-3.5 text-base">
            创建账号
          </Link>
        </div>
      </div>
    </main>
  );
}
