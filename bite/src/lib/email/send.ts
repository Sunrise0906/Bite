// 邮件发送：直接打 Resend HTTP API（不引 SDK），未配置则静默 no-op。
// 需要 env：RESEND_API_KEY + EMAIL_FROM（如 "Bite <notify@yourdomain.com>"）。
// 设计：best-effort，所有调用方都应容忍失败 —— 邮件挂了不能阻断主流程。

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export type SendEmailResult =
  | { ok: true }
  | { ok: false; skipped: true }
  | { ok: false; skipped?: false; error: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, skipped: true };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "邮件发送异常",
    };
  }
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://bite-sand.vercel.app"
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 统一的品牌邮件外壳（terracotta 配色，inline 样式以兼容邮件客户端） */
function shell(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#faf5ef;padding:24px;font-family:-apple-system,'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #ebe2d3;border-radius:16px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #ebe2d3;">
      <span style="font-size:18px;font-weight:600;color:#9c4226;letter-spacing:-0.01em;">Bite</span>
    </div>
    <div style="padding:24px;color:#1f1a14;font-size:15px;line-height:1.6;">
      ${bodyHtml}
    </div>
  </div>
  <p style="max-width:480px;margin:16px auto 0;color:#8c8170;font-size:12px;text-align:center;">
    你收到这封邮件是因为有人在 Bite 上给你发了通知。
  </p>
</body></html>`;
}

/** 朋友推荐了一家店 → 通知收件人去 inbox 处理 */
export async function notifyRecommendation(params: {
  toEmail: string;
  senderLabel: string;
  placeName: string;
  message: string | null;
}): Promise<SendEmailResult> {
  if (!isEmailConfigured()) return { ok: false, skipped: true };

  const url = `${appUrl()}/recommendations`;
  const sender = escapeHtml(params.senderLabel);
  const place = escapeHtml(params.placeName);
  const note = params.message
    ? `<blockquote style="margin:12px 0;padding:10px 14px;background:#faf5ef;border-left:3px solid #b98a2f;border-radius:0 8px 8px 0;color:#4a4337;">${escapeHtml(
        params.message,
      )}</blockquote>`
    : "";

  const html = shell(`
    <p style="margin:0 0 8px;"><strong>@${sender}</strong> 给你推荐了一家店：</p>
    <p style="margin:0 0 4px;font-size:20px;font-weight:600;color:#9c4226;">${place}</p>
    ${note}
    <p style="margin:16px 0 20px;color:#4a4337;">在收件箱接受后就会加进你的 list。</p>
    <a href="${url}" style="display:inline-block;background:#c75b3a;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:12px;">去收件箱看看</a>
  `);

  const text = `@${params.senderLabel} 给你推荐了「${params.placeName}」${
    params.message ? `\n留言：${params.message}` : ""
  }\n\n去收件箱处理：${url}`;

  return sendEmail({
    to: params.toEmail,
    subject: `@${params.senderLabel} 给你推荐了「${params.placeName}」`,
    html,
    text,
  });
}
