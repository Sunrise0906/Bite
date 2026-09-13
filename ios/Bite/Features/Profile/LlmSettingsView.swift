import SwiftUI
import BiteCore

/// AI 模型设置（web 的 llm-settings-form.tsx）：key 在服务端加密，App 只知道「有没有」
struct LlmSettingsView: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @State private var info: LlmSettingsResponse?
    @State private var provider: ProviderId = .gemini
    @State private var apiKey = ""
    @State private var showKey = false
    @State private var clearKey = false
    @State private var advanced = false
    @State private var baseUrl = ""
    @State private var chatModel = ""
    @State private var extractModel = ""
    @State private var guideOpen = false
    @State private var busy = false
    @State private var testing = false
    @State private var error: String?
    @State private var notice: String?

    private var hasStoredKey: Bool { info?.settings?.provider == provider && (info?.settings?.hasApiKey ?? false) }
    private var hasAppDefault: Bool { info?.appKeyAvailable[provider.rawValue] ?? false }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("选你喜欢的 provider。可以用我们提供的默认额度，也可以填自己的 key 走自己额度。")
                    .font(t.text(13)).foregroundStyle(t.muted)

                Text("PROVIDER").font(t.text(11.5, weight: .semibold)).foregroundStyle(t.muted)
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    ForEach(ProviderId.displayOrder, id: \.self) { p in
                        let on = provider == p
                        Button { provider = p; notice = nil; syncAdvanced() } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(p.label).font(t.text(14, weight: .medium)).foregroundStyle(on ? t.primarySoftTx : t.ink)
                                    if p.isFreeTier { PillView(text: "免费", style: .sage) }
                                }
                                Text(info?.presets[p.rawValue]?.extractModel ?? "").font(t.text(11)).foregroundStyle(t.faint).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(12)
                            .background(on ? t.primarySoft : t.surface)
                            .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous).stroke(on ? t.primary : t.border, lineWidth: t.bw))
                        }
                        .buttonStyle(.plain)
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("API KEY（可选）").font(t.text(11.5, weight: .semibold)).foregroundStyle(t.muted)
                        Spacer()
                        if hasStoredKey, !clearKey { Button("清除") { clearKey = true }.font(t.text(12)).foregroundStyle(t.muted) }
                        if clearKey { Button("撤销清除") { clearKey = false }.font(t.text(12)).foregroundStyle(t.primary) }
                        Button(showKey ? "隐藏" : "显示") { showKey.toggle() }.font(t.text(12)).foregroundStyle(t.primary)
                    }
                    Group {
                        if showKey { TextField(keyPlaceholder, text: $apiKey) } else { SecureField(keyPlaceholder, text: $apiKey) }
                    }
                    .textInputAutocapitalization(.never).autocorrectionDisabled().biteField()
                    Text(keyHint).font(t.text(12)).foregroundStyle(clearKey || (!hasStoredKey && !hasAppDefault) ? t.goldTx : t.muted)
                    if !hasStoredKey, !clearKey { guide }
                }

                DisclosureGroup(isExpanded: $advanced) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Base URL").font(t.text(12, weight: .medium)).foregroundStyle(t.ink2)
                        TextField(info?.presets[provider.rawValue]?.baseUrl ?? "", text: $baseUrl).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().biteField()
                        Text("Extract Model").font(t.text(12, weight: .medium)).foregroundStyle(t.ink2)
                        TextField(info?.presets[provider.rawValue]?.extractModel ?? "", text: $extractModel).textInputAutocapitalization(.never).autocorrectionDisabled().biteField()
                        Text("Chat Model").font(t.text(12, weight: .medium)).foregroundStyle(t.ink2)
                        TextField(info?.presets[provider.rawValue]?.chatModel ?? "", text: $chatModel).textInputAutocapitalization(.never).autocorrectionDisabled().biteField()
                    }
                    .padding(.top, 8)
                } label: {
                    Text("进阶设置（自定义 base URL / 模型）").font(t.text(13)).foregroundStyle(t.primary)
                }

                if let error { ErrorBanner(message: error) }
                if let notice { SuccessBanner(message: notice) }

                HStack(spacing: 8) {
                    Button(busy ? "保存中…" : "保存设置") { Task { await save() } }.buttonStyle(.bite(.primary, full: true)).disabled(busy || testing)
                    Button(testing ? "测试中…" : "测试连接") { Task { await test() } }.buttonStyle(.bite(.ghost)).disabled(busy || testing)
                }
                if info?.settings != nil {
                    Button("重置为 app 默认") { Task { await reset() } }.buttonStyle(.bite(.ghost, full: true)).disabled(busy)
                }
            }
            .bitePage()
            .padding(.vertical, 16)
        }
        .background(t.bg)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("AI 模型设置")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private var keyPlaceholder: String {
        if clearKey { return "保存后将清空，回到 app 默认 key" }
        if hasStoredKey { return "已保存 ····（留空则不改动）" }
        return hasAppDefault ? "留空走 app 默认 key" : "未配置 app key，请填入"
    }

    private var keyHint: String {
        if clearKey { return "保存后会清掉你自带的 key，之后走 app 默认额度。" }
        if hasStoredKey { return "已保存你自己的 key（出于安全不回显）。要换一把就直接填新的，留空则保持不变。" }
        if hasAppDefault {
            let used = info?.usedToday ?? 0, quota = info?.quota ?? 40
            return "留空就用我们提供的共享额度（今天已用 \(used)/\(quota) 次）；填入则走你自己的额度，不受限。"
        }
        return "\(provider.label) 没有 app 默认 key，必须填入才能用。"
    }

    private var guide: some View {
        let g = ApiKeyGuide.guide(for: provider)
        return DisclosureGroup(isExpanded: $guideOpen) {
            VStack(alignment: .leading, spacing: 8) {
                Text("现在大家共用一把 key，而这类免费额度是按 key 算的、不是按人算的 —— 所以一个人多用一点，别人就会被挡。自己弄一把之后，你用你的，互不影响。")
                    .font(t.text(11.5)).foregroundStyle(t.muted)
                if let url = URL(string: g.url) { Link("1. 打开 \(g.site) ↗", destination: url).font(t.text(12, weight: .semibold)).foregroundStyle(t.primary) }
                ForEach(Array(g.steps.enumerated()), id: \.offset) { i, s in
                    Text("\(i + 2). \(s)").font(t.text(12)).foregroundStyle(t.ink2)
                }
                Text("✓ 回到这一页，粘进上面的 API Key 框，点「保存设置」。想确认有没有弄对，点「测试连接」").font(t.text(12)).foregroundStyle(t.ink2)
                Text("复制对了吗？是 \(g.keyLooksLike)。会扣钱吗？\(g.free)。安全吗？key 加密后存在数据库里，页面上不会再显示出来。")
                    .font(t.text(11)).foregroundStyle(t.muted)
            }
            .padding(.top, 6)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text("用自己的 key，就不用跟别人抢额度").font(t.text(12, weight: .semibold)).foregroundStyle(t.ink)
                Text("\(g.free) · 约 2 分钟").font(t.text(11)).foregroundStyle(t.muted)
            }
        }
        .padding(12)
        .background(t.surface2.opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: t.radii.md, style: .continuous))
    }

    private func load() async {
        do {
            let r = try await session.api.llmSettings()
            info = r
            provider = r.settings?.provider ?? .gemini
            syncAdvanced()
            advanced = !(baseUrl.isEmpty && chatModel.isEmpty && extractModel.isEmpty)
        } catch { self.error = ErrorText.friendly(error) }
    }

    private func syncAdvanced() {
        if info?.settings?.provider == provider {
            baseUrl = info?.settings?.baseUrl ?? ""; chatModel = info?.settings?.chatModel ?? ""; extractModel = info?.settings?.extractModel ?? ""
        } else {
            baseUrl = ""; chatModel = ""; extractModel = ""
        }
    }

    private var request: LlmSettingsRequest {
        LlmSettingsRequest(provider: provider.rawValue, apiKey: apiKey.trimmingCharacters(in: .whitespaces).isEmpty ? nil : apiKey.trimmingCharacters(in: .whitespaces),
                           clearApiKey: clearKey, baseUrl: baseUrl.isEmpty ? nil : baseUrl,
                           chatModel: chatModel.isEmpty ? nil : chatModel, extractModel: extractModel.isEmpty ? nil : extractModel)
    }

    private func save() async {
        busy = true; error = nil; notice = nil
        defer { busy = false }
        do {
            try await session.api.saveLlmSettings(request)
            apiKey = ""; clearKey = false
            notice = "已保存"
            await load()
        } catch { self.error = ErrorText.friendly(error) }
    }

    private func test() async {
        testing = true; error = nil; notice = nil
        defer { testing = false }
        do { try await session.api.testLlmSettings(request); notice = "连接成功 · 模型有响应" }
        catch { self.error = "连接失败：\(ErrorText.friendly(error))" }
    }

    private func reset() async {
        busy = true; error = nil
        defer { busy = false }
        do { try await session.api.resetLlmSettings(); apiKey = ""; clearKey = false; notice = "已重置为 app 默认"; await load() }
        catch { self.error = ErrorText.friendly(error) }
    }
}

/// 自建 key 引导（web 的 api-key-guide.tsx，给完全不懂技术的人看）
enum ApiKeyGuide {
    struct Guide { var url: String; var site: String; var free: String; var keyLooksLike: String; var steps: [String] }

    static func guide(for p: ProviderId) -> Guide {
        switch p {
        case .gemini:
            return Guide(url: "https://aistudio.google.com/app/apikey", site: "Google AI Studio", free: "免费，不用绑银行卡", keyLooksLike: "AIza 开头的一长串",
                         steps: ["用你的 Google 账号登录（就是平时的 Gmail 账号）", "点蓝色按钮 “Create API key”", "如果问你选项目，随便选一个 / 点 “Create API key in new project”", "点旁边的复制图标，把那串字复制下来"])
        case .qwen:
            return Guide(url: "https://bailian.console.aliyun.com/?tab=model#/api-key", site: "阿里云百炼", free: "有免费额度", keyLooksLike: "sk- 开头的一长串",
                         steps: ["用支付宝/淘宝账号登录阿里云（首次可能要开通「百炼」服务，免费）", "点「创建我的 API-KEY」", "点「查看」再复制那串字"])
        case .deepseek:
            return Guide(url: "https://platform.deepseek.com/api_keys", site: "DeepSeek 开放平台", free: "注册送额度", keyLooksLike: "sk- 开头的一长串",
                         steps: ["注册 / 登录", "点「创建 API key」，随便起个名字", "复制弹出来的那串字（只显示一次，一定要当场复制）"])
        case .openai:
            return Guide(url: "https://platform.openai.com/api-keys", site: "OpenAI Platform", free: "⚠️ 需要绑卡并充值，不免费", keyLooksLike: "sk- 开头的一长串",
                         steps: ["登录后点 “Create new secret key”", "复制弹出来的那串字（只显示一次）"])
        case .anthropic:
            return Guide(url: "https://console.anthropic.com/settings/keys", site: "Anthropic Console", free: "⚠️ 需要充值，不免费", keyLooksLike: "sk-ant- 开头的一长串",
                         steps: ["登录后点 “Create Key”", "复制弹出来的那串字（只显示一次）"])
        }
    }
}
