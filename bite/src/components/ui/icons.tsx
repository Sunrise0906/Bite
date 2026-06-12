/**
 * 共享 SVG 图标库（lucide 风格 stroke 图标）。
 * 设计约定：不用 emoji 当图标（UI 升级 checklist），统一从这里引。
 * 默认 16px、stroke=currentColor，尺寸用 size prop 调。
 */

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function base(props: IconProps) {
  const { size = 16, className, strokeWidth = 1.9 } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true as const,
  };
}

export function MapPinIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function StarIcon(props: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = props;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z" />
    </svg>
  );
}

export function HeartIcon(props: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = props;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M19.5 5.1a5 5 0 0 0-7.1 0L12 5.5l-.4-.4a5 5 0 1 0-7.1 7.1l.4.4L12 19.7l7.1-7.1.4-.4a5 5 0 0 0 0-7.1z" />
    </svg>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 8h2.5l1.5-2.5h8L17.5 8H20a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-4.5-4.5L7 21" />
    </svg>
  );
}

/** 来源 · 小红书帖子 */
export function BookIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 19V5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2zm0 0a2 2 0 0 1 2-2h14" />
    </svg>
  );
}

/** 来源 · AI 提取 / AI 备注 */
export function BotIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="8" width="14" height="11" rx="2.5" />
      <path d="M12 8V4.5M9.5 4.5h5" />
      <path d="M9 13h.01M15 13h.01" strokeWidth={2.6} />
      <path d="M9.5 16.2c.7.5 1.6.8 2.5.8s1.8-.3 2.5-.8" />
    </svg>
  );
}

/** 来源 · Google Places */
export function GlobeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a13.5 13.5 0 0 1 0 18M12 3a13.5 13.5 0 0 0 0 18" />
    </svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4l1.7 4.3L18 10l-4.3 1.7L12 16l-1.7-4.3L6 10l4.3-1.7z" />
      <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17 3.5a2.1 2.1 0 0 1 3 3L8.5 18 4 19.5 5.5 15z" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l1 12a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 11a8 8 0 1 0-1.5 5.5M20 5v6h-6" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.3 2.9-5 6.5-5s6.5 1.7 6.5 5" />
      <path d="M16 5a3.5 3.5 0 0 1 0 6.7M21.5 20c0-2.6-1.8-4.1-4.3-4.7" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 14.5 14.5 9.5M8 11l-2.5 2.5a3.5 3.5 0 0 0 5 5L13 16M11 8l2.5-2.5a3.5 3.5 0 0 1 5 5L16 13" />
    </svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 13.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18v-4.5M3 13.5 5.7 5.6A1.5 1.5 0 0 1 7.1 4.5h9.8a1.5 1.5 0 0 1 1.4 1.1L21 13.5M3 13.5h5l1.5 2.5h5l1.5-2.5h5" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8z" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 4 2.8 19.5a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5z" />
      <path d="M12 10v4M12 17.5h.01" strokeWidth={2.4} />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m5 9 7 7 7-7" />
    </svg>
  );
}

export function UtensilsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3v7a2 2 0 0 1-2 2M3 3v7a2 2 0 0 0 2 2m0 0v9M17 3c-1.7 0-3 2.2-3 5s1.3 5 3 5m0-10v18m0-8c1.7 0 3-2.2 3-5s-1.3-5-3-5" />
    </svg>
  );
}

export function FlameIcon(props: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = props;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M12 21c4 0 6.5-2.6 6.5-6.2 0-2.8-1.7-4.6-3-6.3-1.2-1.5-2.3-2.9-2.5-5-2.5 1.6-4 3.7-4.3 5.9-.1.8-.1 1.6 0 2.3-1-.3-1.9-1-2.4-2C5.2 11 5.5 13 5.5 14.8 5.5 18.4 8 21 12 21z" />
    </svg>
  );
}

export function ThumbsUpIcon(props: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = props;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4-7.5a2 2 0 0 1 2 2V9h5.4a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17.2 19H7" />
    </svg>
  );
}

export function ThumbsDownIcon(props: IconProps & { filled?: boolean }) {
  const { filled, ...rest } = props;
  return (
    <svg {...base(rest)} fill={filled ? "currentColor" : "none"}>
      <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3zm0 0-4 7.5a2 2 0 0 1-2-2V15H5.6a2 2 0 0 1-2-2.4l1.2-6A2 2 0 0 1 6.8 5H17" />
    </svg>
  );
}
