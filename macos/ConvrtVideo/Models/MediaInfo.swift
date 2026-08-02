import Foundation

/// Informações lidas do arquivo com `ffprobe`.
struct MediaInfo: Equatable {
    var duracao: Double = 0
    var largura: Int = 0
    var altura: Int = 0
    var codecVideo: String = ""
    var codecAudio: String = ""
    var fps: Double = 0
    var entrelacado: Bool = false
    var sar: String = ""
    var dar: String = ""
    var formato: String = ""
    var bitrate: Int = 0

    /// Proporção anamórfica (pixel não quadrado), comum em DV, VOB e MTS antigos.
    var pixelNaoQuadrado: Bool {
        !sar.isEmpty && sar != "1:1" && sar != "0:1" && sar != "N/A"
    }

    var resumo: String {
        var partes: [String] = []
        if largura > 0 { partes.append("\(largura)×\(altura)") }
        if !codecVideo.isEmpty { partes.append(codecVideo.uppercased()) }
        if fps > 0 { partes.append(String(format: "%.0f fps", fps)) }
        if entrelacado { partes.append("entrelaçado") }
        if pixelNaoQuadrado { partes.append("pixel \(sar)") }
        if !codecAudio.isEmpty { partes.append("áudio \(codecAudio.uppercased())") }
        return partes.joined(separator: " · ")
    }

    var duracaoFormatada: String {
        guard duracao > 0 else { return "—" }
        let total = Int(duracao.rounded())
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0
            ? String(format: "%d:%02d:%02d", h, m, s)
            : String(format: "%d:%02d", m, s)
    }
}

// MARK: - Decodificação da saída JSON do ffprobe

struct FFProbeSaida: Decodable {
    struct Formato: Decodable {
        var duration: String?
        var format_name: String?
        var bit_rate: String?
    }

    struct Stream: Decodable {
        var codec_type: String?
        var codec_name: String?
        var width: Int?
        var height: Int?
        var r_frame_rate: String?
        var avg_frame_rate: String?
        var field_order: String?
        var sample_aspect_ratio: String?
        var display_aspect_ratio: String?
    }

    var format: Formato?
    var streams: [Stream]?

    func paraMediaInfo() -> MediaInfo {
        var info = MediaInfo()
        info.duracao = Double(format?.duration ?? "") ?? 0
        info.formato = format?.format_name ?? ""
        info.bitrate = Int(format?.bit_rate ?? "") ?? 0

        if let video = streams?.first(where: { $0.codec_type == "video" }) {
            info.largura = video.width ?? 0
            info.altura = video.height ?? 0
            info.codecVideo = video.codec_name ?? ""
            info.sar = video.sample_aspect_ratio ?? ""
            info.dar = video.display_aspect_ratio ?? ""
            info.fps = MediaInfo.avaliarFracao(video.avg_frame_rate ?? video.r_frame_rate ?? "")
            let ordem = video.field_order ?? "progressive"
            info.entrelacado = ordem != "progressive" && ordem != "unknown" && !ordem.isEmpty
        }
        if let audio = streams?.first(where: { $0.codec_type == "audio" }) {
            info.codecAudio = audio.codec_name ?? ""
        }
        return info
    }
}

extension MediaInfo {
    /// "30000/1001" -> 29.97
    static func avaliarFracao(_ texto: String) -> Double {
        let partes = texto.split(separator: "/")
        if partes.count == 2, let a = Double(partes[0]), let b = Double(partes[1]), b != 0 {
            return a / b
        }
        return Double(texto) ?? 0
    }
}
