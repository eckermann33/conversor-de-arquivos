import Foundation
import SwiftUI
import AppKit

/// Estado da tela: fila de arquivos, ajustes e execução (um vídeo por vez,
/// porque o ffmpeg já usa todos os núcleos do processador).
final class ConversionQueue: ObservableObject {

    @Published var jobs: [VideoJob] = []
    @Published var ajustes = ConversionSettings()
    @Published var convertendo = false
    @Published var jobAtual: VideoJob?
    @Published var ffmpegDisponivel = false
    @Published var versaoFFmpeg: String?
    @Published var aviso: String?
    /// Explicação de por que o ffmpeg escolhido não funcionou (nil = tudo certo).
    @Published var problemaFFmpeg: String?

    private let executor = FFmpegRunner()
    private var pararTudo = false

    /// Extensões que o app aceita. A lista é generosa de propósito: câmera
    /// antiga grava em formato que ninguém mais lembra.
    static let extensoesAceitas: Set<String> = [
        // camcorders de HDD/DVD e AVCHD
        "mod", "tod", "mts", "m2ts", "m2t", "ts", "vob", "mpg", "mpeg", "mpe", "m2v", "vro",
        // fitas e câmeras digitais antigas
        "dv", "dif", "avi", "mov", "qt", "mjpeg", "mjpg",
        // celulares e câmeras compactas
        "3gp", "3g2", "mp4", "m4v", "amv",
        // Windows e web antigos
        "wmv", "asf", "rm", "rmvb", "flv", "f4v", "swf", "ogv", "ogm",
        // modernos
        "mkv", "webm", "mxf", "gxf", "y4m"
    ]

    init() {
        verificarFFmpeg()
    }

    // MARK: - ffmpeg

    func verificarFFmpeg() {
        if let url = FFmpegLocator.localizar("ffmpeg"), let versao = FFmpegLocator.versao(de: url) {
            ffmpegDisponivel = true
            versaoFFmpeg = versao
            problemaFFmpeg = nil
        } else {
            ffmpegDisponivel = false
            versaoFFmpeg = nil
        }
    }

    func usarFFmpegEm(_ url: URL) {
        FFmpegLocator.registrarEscolha(url)
        problemaFFmpeg = FFmpegLocator.diagnosticar(url)
        verificarFFmpeg()
        if problemaFFmpeg == nil && !ffmpegDisponivel {
            problemaFFmpeg = "Esse arquivo não parece ser o ffmpeg."
        }
    }

    /// Abre o painel de Privacidade e Segurança, onde fica o botão
    /// "Abrir Mesmo Assim" para liberar um programa baixado da internet.
    func abrirAjustesDeSeguranca() {
        let enderecos = [
            "x-apple.systempreferences:com.apple.settings.PrivacyAndSecurity",
            "x-apple.systempreferences:com.apple.preference.security"
        ]
        for endereco in enderecos {
            if let url = URL(string: endereco), NSWorkspace.shared.open(url) { return }
        }
    }

    // MARK: - fila

    func adicionar(_ urls: [URL]) {
        var adicionados = 0
        var ignorados: [String] = []

        for url in urls {
            var ehPasta: ObjCBool = false
            FileManager.default.fileExists(atPath: url.path, isDirectory: &ehPasta)

            if ehPasta.boolValue {
                let conteudo = (try? FileManager.default.contentsOfDirectory(
                    at: url, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])) ?? []
                adicionar(conteudo)
                continue
            }

            let ext = url.pathExtension.lowercased()
            guard Self.extensoesAceitas.contains(ext) else {
                if !ext.isEmpty { ignorados.append(url.lastPathComponent) }
                continue
            }
            guard !jobs.contains(where: { $0.entrada == url }) else { continue }

            let job = VideoJob(entrada: url)
            jobs.append(job)
            adicionados += 1
            analisar(job)
        }

        if adicionados == 0 && !ignorados.isEmpty {
            aviso = ignorados.count == 1
                ? "\(ignorados[0]) não parece ser um vídeo."
                : "\(ignorados.count) arquivos ignorados por não serem vídeo."
        }
    }

    private func analisar(_ job: VideoJob) {
        job.status = .analisando
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            let info = try? self.executor.analisar(job.entrada)
            DispatchQueue.main.async {
                job.info = info
                if info == nil {
                    job.status = .falhou("Não consegui ler esse arquivo.")
                    job.mensagemErro = "O ffprobe não reconheceu o formato."
                } else {
                    job.status = .aguardando
                }
            }
        }
    }

    func remover(_ job: VideoJob) {
        if jobAtual === job { cancelar() }
        jobs.removeAll { $0 === job }
    }

    func limparConcluidos() {
        jobs.removeAll { $0.status.terminou }
    }

    func limparTudo() {
        cancelar()
        jobs.removeAll()
    }

    // MARK: - execução

    func converterTudo() {
        guard !convertendo else { return }
        guard ffmpegDisponivel else {
            aviso = "Instale o ffmpeg antes de converter."
            return
        }
        pararTudo = false
        convertendo = true
        proximo()
    }

    func cancelar() {
        pararTudo = true
        executor.cancelar()
        if let atual = jobAtual, !atual.status.terminou {
            atual.status = .cancelado
        }
        jobAtual = nil
        convertendo = false
    }

    private func proximo() {
        guard !pararTudo else {
            convertendo = false
            jobAtual = nil
            return
        }
        guard let job = jobs.first(where: { $0.status.emFila }) else {
            convertendo = false
            jobAtual = nil
            return
        }

        jobAtual = job
        job.status = .convertendo
        job.progresso = 0

        let destino = ajustes.urlDeSaida(para: job.entrada)

        executor.converter(
            entrada: job.entrada,
            saida: destino,
            ajustes: ajustes,
            info: job.info,
            aoProgredir: { fracao in job.progresso = fracao },
            aoTerminar: { [weak self] resultado in
                guard let self else { return }
                switch resultado {
                case .success(let url):
                    job.status = .concluido
                    job.progresso = 1
                    job.saida = url
                    let atributos = try? FileManager.default.attributesOfItem(atPath: url.path)
                    job.tamanhoFinal = (atributos?[.size] as? NSNumber)?.int64Value ?? 0
                    if self.ajustes.manterDataOriginal { self.copiarDatas(de: job.entrada, para: url) }
                case .failure(let erro):
                    if case FFmpegRunner.ErroFFmpeg.cancelado = erro {
                        job.status = .cancelado
                    } else {
                        job.status = .falhou(erro.localizedDescription)
                        job.mensagemErro = erro.localizedDescription
                    }
                }
                self.proximo()
            }
        )
    }

    /// Preserva a data de gravação — sem isso o vídeo de 2003 aparece como de hoje
    /// e o Fotos/Finder bagunça a ordem cronológica.
    private func copiarDatas(de origem: URL, para destino: URL) {
        let gerenciador = FileManager.default
        guard let atributos = try? gerenciador.attributesOfItem(atPath: origem.path) else { return }
        var novos: [FileAttributeKey: Any] = [:]
        if let criacao = atributos[.creationDate] { novos[.creationDate] = criacao }
        if let modificacao = atributos[.modificationDate] { novos[.modificationDate] = modificacao }
        try? gerenciador.setAttributes(novos, ofItemAtPath: destino.path)
    }

    // MARK: - resumo

    var totalNaFila: Int { jobs.filter { $0.status.emFila }.count }
    var totalConcluido: Int { jobs.filter { $0.status == .concluido }.count }
    var totalComErro: Int { jobs.filter { if case .falhou = $0.status { return true } else { return false } }.count }

    var progressoGeral: Double {
        guard !jobs.isEmpty else { return 0 }
        let soma = jobs.reduce(0.0) { total, job in
            switch job.status {
            case .concluido: return total + 1
            case .convertendo: return total + job.progresso
            default: return total
            }
        }
        return soma / Double(jobs.count)
    }
}
