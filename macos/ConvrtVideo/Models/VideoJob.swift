import Foundation

enum JobStatus: Equatable {
    case aguardando
    case analisando
    case convertendo
    case concluido
    case cancelado
    case falhou(String)

    var titulo: String {
        switch self {
        case .aguardando:      return "na fila"
        case .analisando:      return "analisando…"
        case .convertendo:     return "convertendo…"
        case .concluido:       return "pronto"
        case .cancelado:       return "cancelado"
        case .falhou:          return "falhou"
        }
    }

    var emFila: Bool {
        self == .aguardando
    }

    var terminou: Bool {
        switch self {
        case .concluido, .cancelado, .falhou: return true
        default: return false
        }
    }
}

/// Um arquivo da fila. É uma classe observável porque a linha da lista
/// acompanha o progresso em tempo real.
final class VideoJob: ObservableObject, Identifiable {
    let id = UUID()
    let entrada: URL

    @Published var status: JobStatus = .aguardando
    @Published var progresso: Double = 0
    @Published var info: MediaInfo?
    @Published var saida: URL?
    @Published var mensagemErro: String = ""
    @Published var tamanhoOriginal: Int64 = 0
    @Published var tamanhoFinal: Int64 = 0

    init(entrada: URL) {
        self.entrada = entrada
        let atributos = try? FileManager.default.attributesOfItem(atPath: entrada.path)
        self.tamanhoOriginal = (atributos?[.size] as? NSNumber)?.int64Value ?? 0
    }

    var nome: String { entrada.lastPathComponent }

    var economia: String? {
        guard tamanhoOriginal > 0, tamanhoFinal > 0 else { return nil }
        let diferenca = 1 - Double(tamanhoFinal) / Double(tamanhoOriginal)
        let percentual = Int((abs(diferenca) * 100).rounded())
        if percentual < 1 { return "mesmo tamanho" }
        return diferenca > 0 ? "\(percentual)% menor" : "\(percentual)% maior"
    }

    static func formatarTamanho(_ bytes: Int64) -> String {
        guard bytes > 0 else { return "—" }
        let formatador = ByteCountFormatter()
        formatador.countStyle = .file
        return formatador.string(fromByteCount: bytes)
    }
}
