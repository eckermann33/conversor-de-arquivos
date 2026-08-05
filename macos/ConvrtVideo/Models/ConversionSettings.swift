import Foundation

/// Presets pensados para material de câmera antiga (MiniDV, HDD/DVD camcorder,
/// AVCHD, celular antigo), onde o problema costuma ser entrelaçamento,
/// pixel não quadrado e codecs que o QuickTime não abre mais.
enum Preset: String, CaseIterable, Identifiable {
    case compatibilidade
    case qualidade
    case menorArquivo
    case rapidoGPU
    case remux

    var id: String { rawValue }

    var titulo: String {
        switch self {
        case .compatibilidade: return "Compatibilidade máxima"
        case .qualidade:       return "Melhor qualidade"
        case .menorArquivo:    return "Menor arquivo (H.265)"
        case .rapidoGPU:       return "Rápido (placa de vídeo)"
        case .remux:           return "Só trocar o invólucro"
        }
    }

    var descricao: String {
        switch self {
        case .compatibilidade:
            return "H.264 + AAC, yuv420p. Abre em qualquer Mac, iPhone, TV e editor."
        case .qualidade:
            return "H.264 com CRF baixo e preset lento. Arquivo maior, imagem mais fiel ao original."
        case .menorArquivo:
            return "H.265/HEVC. Metade do tamanho, mas precisa de Mac/iPhone razoavelmente recente."
        case .rapidoGPU:
            return "Codifica no chip de vídeo do Mac (VideoToolbox). Muito mais rápido, qualidade um pouco menor."
        case .remux:
            return "Não recodifica: só troca o invólucro para .mp4. Instantâneo, mas só funciona se o vídeo já for H.264/HEVC."
        }
    }

    var recodifica: Bool { self != .remux }
}

enum Resolucao: String, CaseIterable, Identifiable {
    case original, p1080, p720, p480

    var id: String { rawValue }

    var titulo: String {
        switch self {
        case .original: return "Manter original"
        case .p1080:    return "Até 1080p"
        case .p720:     return "Até 720p"
        case .p480:     return "Até 480p"
        }
    }

    var alturaMaxima: Int? {
        switch self {
        case .original: return nil
        case .p1080:    return 1080
        case .p720:     return 720
        case .p480:     return 480
        }
    }
}

enum Rotacao: String, CaseIterable, Identifiable {
    case nenhuma, horario, antiHorario, cabecaParaBaixo

    var id: String { rawValue }

    var titulo: String {
        switch self {
        case .nenhuma:          return "Não girar"
        case .horario:          return "90° horário"
        case .antiHorario:      return "90° anti-horário"
        case .cabecaParaBaixo:  return "180°"
        }
    }

    var filtro: String? {
        switch self {
        case .nenhuma:         return nil
        case .horario:         return "transpose=1"
        case .antiHorario:     return "transpose=2"
        case .cabecaParaBaixo: return "transpose=1,transpose=1"
        }
    }
}

enum Desentrelacar: String, CaseIterable, Identifiable {
    case automatico, sempre, nunca

    var id: String { rawValue }

    var titulo: String {
        switch self {
        case .automatico: return "Automático (recomendado)"
        case .sempre:     return "Sempre"
        case .nunca:      return "Nunca"
        }
    }
}

/// Todas as opções da conversão + a montagem dos argumentos do ffmpeg.
struct ConversionSettings: Equatable {
    var preset: Preset = .compatibilidade
    var resolucao: Resolucao = .original
    var rotacao: Rotacao = .nenhuma
    var desentrelacar: Desentrelacar = .automatico
    var corrigirProporcao = true
    var qualidade: Double = 20          // CRF: menor = melhor
    var bitrateAudio: Int = 192
    var normalizarFps = false
    var manterDataOriginal = true
    var pastaSaida: URL?                // nil = ao lado do arquivo de origem
    var sufixo: String = ""

    // MARK: Caminho de saída

    func urlDeSaida(para entrada: URL, evitandoColisao: Bool = true) -> URL {
        let pasta = pastaSaida ?? entrada.deletingLastPathComponent()
        let base = entrada.deletingPathExtension().lastPathComponent + sufixo
        var destino = pasta.appendingPathComponent(base).appendingPathExtension("mp4")

        guard evitandoColisao else { return destino }
        var contador = 2
        while FileManager.default.fileExists(atPath: destino.path) {
            destino = pasta
                .appendingPathComponent("\(base)-\(contador)")
                .appendingPathExtension("mp4")
            contador += 1
        }
        return destino
    }

    // MARK: Filtros de vídeo

    /// Monta a cadeia -vf. A ordem importa: desentrelaçar antes de escalar.
    func filtros(para info: MediaInfo?) -> [String] {
        var cadeia: [String] = []

        let precisaDesentrelacar: Bool
        switch desentrelacar {
        case .sempre:     precisaDesentrelacar = true
        case .nunca:      precisaDesentrelacar = false
        case .automatico: precisaDesentrelacar = info?.entrelacado ?? false
        }
        // bwdif dá resultado melhor que yadif e tem o mesmo custo prático.
        if precisaDesentrelacar { cadeia.append("bwdif=mode=send_frame:parity=auto:deint=all") }

        // Pixel não quadrado (DV 4:3, VOB, MTS antigo) vira pixel quadrado.
        if corrigirProporcao, info?.pixelNaoQuadrado ?? false {
            cadeia.append("scale=trunc(iw*sar/2)*2:trunc(ih/2)*2")
            cadeia.append("setsar=1")
        }

        if let altura = resolucao.alturaMaxima {
            // -2 calcula a largura mantendo a proporção e arredonda para número
            // par (o H.264 exige). min(...) garante que nunca aumenta o vídeo.
            cadeia.append("scale=-2:'min(\(altura),trunc(ih/2)*2)'")
        }

        if let giro = rotacao.filtro { cadeia.append(giro) }
        if normalizarFps { cadeia.append("fps=30") }

        return cadeia
    }

    // MARK: Argumentos do ffmpeg

    func argumentos(entrada: URL, saida: URL, info: MediaInfo?) -> [String] {
        var args = [
            "-hide_banner",
            "-nostdin",
            "-loglevel", "error",
            "-y",
            "-i", entrada.path
        ]

        // Pega só o primeiro vídeo e o primeiro áudio: VOB e MTS costumam ter
        // faixas extras (menu, dados, closed caption) que quebram o .mp4.
        args += ["-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn"]

        if preset == .remux {
            args += ["-c", "copy"]
        } else {
            let cadeia = filtros(para: info)
            if !cadeia.isEmpty { args += ["-vf", cadeia.joined(separator: ",")] }

            switch preset {
            case .compatibilidade:
                args += ["-c:v", "libx264", "-preset", "medium", "-crf", String(Int(qualidade)),
                         "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p"]
            case .qualidade:
                args += ["-c:v", "libx264", "-preset", "slow", "-crf", String(max(14, Int(qualidade) - 4)),
                         "-profile:v", "high", "-pix_fmt", "yuv420p"]
            case .menorArquivo:
                args += ["-c:v", "libx265", "-preset", "medium", "-crf", String(Int(qualidade) + 4),
                         "-tag:v", "hvc1", "-pix_fmt", "yuv420p"]
            case .rapidoGPU:
                // O VideoToolbox não entende CRF, e -q:v só existe em versões
                // recentes do ffmpeg — bitrate alvo funciona em qualquer uma.
                // CRF 14 -> ~16 Mbps, CRF 30 -> ~4 Mbps.
                let mbps = max(4, min(16, Int(((30 - qualidade) / 16 * 12) + 4)))
                args += ["-c:v", "h264_videotoolbox", "-b:v", "\(mbps)M", "-pix_fmt", "yuv420p"]
            case .remux:
                break
            }

            args += ["-c:a", "aac", "-b:a", "\(bitrateAudio)k", "-ac", "2"]
        }

        // faststart deixa o vídeo tocar antes de terminar de carregar
        args += ["-movflags", "+faststart", "-map_metadata", "0"]
        args += ["-progress", "pipe:1", "-nostats"]
        args.append(saida.path)
        return args
    }

    /// Linha de comando equivalente, mostrada na interface (e útil pra depurar).
    func comandoLegivel(entrada: URL, saida: URL, info: MediaInfo?, ffmpeg: String = "ffmpeg") -> String {
        let args = argumentos(entrada: entrada, saida: saida, info: info)
            .filter { $0 != "-progress" && $0 != "pipe:1" && $0 != "-nostats" }
        let escapados = args.map { $0.contains(" ") ? "\"\($0)\"" : $0 }
        return ([ffmpeg] + escapados).joined(separator: " ")
    }
}
