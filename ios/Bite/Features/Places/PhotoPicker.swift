import SwiftUI
import PhotosUI
import BiteCore

/// 图片条：已有图（canonical + 展示映射）+ 上传按钮（相册 / 拍照）+ 移除
struct PhotoStrip: View {
    @Environment(AppSession.self) private var session
    @Environment(\.bite) private var t
    @Binding var photos: [String]
    @Binding var displayMap: [String: String]
    var maxFiles: Int = 9

    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var showCamera = false
    @State private var uploading = 0
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Array(photos.enumerated()), id: \.offset) { i, u in
                            ZStack(alignment: .topTrailing) {
                                RemoteImage(url: displayMap[u] ?? u).frame(width: 84, height: 84)
                                    .clipShape(RoundedRectangle(cornerRadius: t.radii.sm, style: .continuous))
                                Button { photos.remove(at: i) } label: {
                                    Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
                                        .padding(5).background(.black.opacity(0.6)).clipShape(Circle())
                                }
                                .padding(4)
                            }
                        }
                    }
                }
            }
            HStack(spacing: 8) {
                PhotosPicker(selection: $pickerItems, maxSelectionCount: max(1, maxFiles - photos.count), matching: .images) {
                    Label(uploading > 0 ? "上传中 \(uploading)…" : "相册（剩 \(max(0, maxFiles - photos.count)) 张）", systemImage: "photo").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bite(.ghost, full: true))
                .disabled(photos.count >= maxFiles || uploading > 0)
                Button { showCamera = true } label: { Image(systemName: "camera") }
                    .buttonStyle(.bite(.ghost))
                    .disabled(photos.count >= maxFiles || uploading > 0)
            }
            if let error { Text(error).font(t.text(12)).foregroundStyle(t.danger) }
        }
        .onChange(of: pickerItems) { _, items in
            guard !items.isEmpty else { return }
            let picked = items
            pickerItems = []
            Task { await upload(items: picked) }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in Task { await upload(images: [image]) } }.ignoresSafeArea()
        }
    }

    private func upload(items: [PhotosPickerItem]) async {
        var images: [UIImage] = []
        for it in items {
            if let data = try? await it.loadTransferable(type: Data.self), let img = UIImage(data: data) { images.append(img) }
        }
        await upload(images: images)
    }

    private func upload(images: [UIImage]) async {
        guard let uid = session.userId else { return }
        error = nil
        for img in images.prefix(max(0, maxFiles - photos.count)) {
            uploading += 1
            defer { uploading -= 1 }
            guard let data = PhotoService.jpegData(from: img) else { error = "图片处理失败"; continue }
            do {
                let up = try await session.photos.upload(data: data, mime: "image/jpeg", originalName: "photo.jpg", userId: uid)
                photos.append(up.canonical)
                displayMap[up.canonical] = up.display
            } catch {
                self.error = ErrorText.friendly(error)
            }
        }
    }
}

/// 系统相机
struct CameraPicker: UIViewControllerRepresentable {
    @Environment(\.dismiss) private var dismiss
    var onImage: (UIImage) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let c = UIImagePickerController()
        c.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        c.delegate = context.coordinator
        return c
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage { parent.onImage(img) }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}
