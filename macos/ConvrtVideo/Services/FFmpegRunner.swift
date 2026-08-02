import Foundation

/// Executa ffprobe/ffmpeg como subprocesso e acompanha o progresso.
///
/// O progresso vem de `-progress pipe:1`, que imprime pares `chave=valor` a
/// cada segundo — bem mais confiável do que tentar interpretar o stderr.
final class FFmpegRunner {

    enum ErroFFmpeg: LocalizedError {
        case ffmpegNaoEncontrado
        case ffprobeNaoEncontrado
        case falhouAoIniciar(String)
        case saidaComErro(codigo: Int32, mensagem: String)
        case cancelado

        var errorDescription: String? {
            switch self {
            case .ffmpegNaoEncontrado:
                return "Não encontrei o ffmpeg. Instale com Homebrew (brew install ffmpeg) ou aponte o caminho nas configurações."
            case .ffprobeNaoEncontrado:
                return "Não encontrei o ffprobe (vem junto com o ffmpeg)."
            case .falhouAoIniciar(let detalhe):
                return "Não consegui iniciar o ffmpeg: \(detalhe)"
            case .saidaComErro(let codigo, let mensagem):
                let limpa = mensagem.trimmingCharacters(in: .whitespacesAndNewlines)
                return limpa.isEmpty
                    ? "O ffmpeg terminou com erro (código \(codigo))."
                    : limpa
            case .cancelado:
                return "Conversão cancelada."
            }
        }
    }

    private var processoAtual: Process?
    private let fila = DispatchQueue(label: "convrt.ffmpeg", qos: .userInitiated)

    // MARK: - ffprobe

    func analisar(_ url: URL) throws -> MediaInfo {
        guard let ffprobe = FFmpegLocator.localizar("ffprobe") else {
            throw ErroFFmpeg.ffprobeNaoEncontrado
        }

        let processo = Process()
        processo.executableURL = ffprobe
        processo.arguments = [
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            url.path
        ]

        let saida = Pipe()
        processo.standardOutput = saida
        processo.standardError = Pipe()

        do { try processo.run() } catch {
            throw ErroFFmpeg.falhouAoIniciar(error.localizedDescription)
        }

        let dados = saida.fileHandleForReading.readDataToEndOfFile()
        processo.waitUntilExit()

        guard let resposta = try? JSONDecoder().decode(FFProbeSaida.self, from: dados) else {
            throw ErroFFmpeg.saidaComErro(
                codigo: processo.terminationStatus,
                mensagem: "Não consegui ler as informações do arquivo. Ele pode estar corrompido ou não ser um vídeo."
            )
        }
        return resposta.paraMediaInfo()
    }

    // MARK: - conversão

    /// Converte de forma assíncrona. `aoProgredir` é chamado na thread principal.
    func converter(
        entrada: URL,
        saida: URL,
        ajustes: ConversionSettings,
        info: MediaInfo?,
        aoProgredir: @escaping (Double) -> Void,
        aoTerminar: @escaping (Result<URL, Error>) -> Void
    ) {
        guard let ffmpeg = FFmpegLocator.localizar("ffmpeg") else {
            DispatchQueue.main.async { aoTerminar(.failure(ErroFFmpeg.ffmpegNaoEncontrado)) }
            return
        }

        fila.async { [weak self] in
            guard let self else { return }

            let processo = Process()
            processo.executableURL = ffmpeg
            processo.arguments = ajustes.argumentos(entrada: entrada, saida: saida, info: info)

            let canalProgresso = Pipe()
            let canalErro = Pipe()
            processo.standardOutput = canalProgresso
            processo.standardError = canalErro
            processo.standardInput = FileHandle.nullDevice

            let duracao = info?.duracao ?? 0
            var textoErro = ""
            let trava = NSLock()

            canalProgresso.fileHandleForReading.readabilityHandler = { handle in
                let dados = handle.availableData
                guard !dados.isEmpty, let texto = String(data: dados, encoding: .utf8) else { return }
                guard duracao > 0 else { return }

                for linha in texto.split(separator: "\n") {
                    // out_time_us=12345678  (microssegundos já processados)
                    guard linha.hasPrefix("out_time_us="), let valor = Double(linha.dropFirst(12)) else { continue }
                    let fracao = min(0.999, max(0, (valor / 1_000_000) / duracao))
                    DispatchQueue.main.async { aoProgredir(fracao) }
                }
            }

            canalErro.fileHandleForReading.readabilityHandler = { handle in
                let dados = handle.availableData
                guard !dados.isEmpty, let texto = String(data: dados, encoding: .utf8) else { return }
                trava.lock()
                textoErro += texto
                // guarda só o final: mensagem de erro do ffmpeg vem no fim
                if textoErro.count > 4000 { textoErro = String(textoErro.suffix(4000)) }
                trava.unlock()
            }

            self.processoAtual = processo

            do {
                try processo.run()
            } catch {
                DispatchQueue.main.async { aoTerminar(.failure(ErroFFmpeg.falhouAoIniciar(error.localizedDescription))) }
                return
            }

            processo.waitUntilExit()
            canalProgresso.fileHandleForReading.readabilityHandler = nil
            canalErro.fileHandleForReading.readabilityHandler = nil
            self.processoAtual = nil

            let codigo = processo.terminationStatus
            trava.lock()
            let erroFinal = textoErro
            trava.unlock()

            DispatchQueue.main.async {
                if processo.terminationReason == .uncaughtSignal {
                    try? FileManager.default.removeItem(at: saida)
                    aoTerminar(.failure(ErroFFmpeg.cancelado))
                } else if codigo == 0 {
                    aoProgredir(1)
                    aoTerminar(.success(saida))
                } else {
                    try? FileManager.default.removeItem(at: saida)
                    aoTerminar(.failure(ErroFFmpeg.saidaComErro(codigo: codigo, mensagem: erroFinal)))
                }
            }
        }
    }

    func cancelar() {
        processoAtual?.terminate()
        processoAtual = nil
    }
}
