import Foundation

/// Descobre onde estão o `ffmpeg` e o `ffprobe`, nesta ordem:
///  1. dentro do próprio app (Contents/Resources) — é o caso quando você roda
///     `scripts/fetch-ffmpeg.sh` antes de compilar;
///  2. caminho que o usuário escolheu à mão (fica salvo);
///  3. instalações comuns: Homebrew (Apple Silicon e Intel), MacPorts, /usr/bin.
///
/// Nada aqui acessa a rede.
enum FFmpegLocator {

    private static let chaveFFmpeg = "caminhoFFmpegEscolhido"
    private static let chaveFFprobe = "caminhoFFprobeEscolhido"

    static let caminhosConhecidos = [
        "/opt/homebrew/bin",   // Homebrew no Apple Silicon
        "/usr/local/bin",      // Homebrew no Intel
        "/opt/local/bin",      // MacPorts
        "/usr/bin",
        "/opt/homebrew/opt/ffmpeg/bin"
    ]

    static func localizar(_ nome: String) -> URL? {
        if let empacotado = noBundle(nome) { return empacotado }

        let chave = nome == "ffmpeg" ? chaveFFmpeg : chaveFFprobe
        if let salvo = UserDefaults.standard.string(forKey: chave),
           executavel(salvo) {
            return URL(fileURLWithPath: salvo)
        }

        for pasta in caminhosConhecidos {
            let caminho = (pasta as NSString).appendingPathComponent(nome)
            if executavel(caminho) { return URL(fileURLWithPath: caminho) }
        }
        return nil
    }

    static func registrarEscolha(_ url: URL) {
        let nome = url.lastPathComponent
        let chave = nome.contains("probe") ? chaveFFprobe : chaveFFmpeg
        UserDefaults.standard.set(url.path, forKey: chave)

        // Se o usuário apontou o ffmpeg, o ffprobe quase sempre está do lado.
        let vizinho = url.deletingLastPathComponent()
            .appendingPathComponent(nome.contains("probe") ? "ffmpeg" : "ffprobe")
        if executavel(vizinho.path) {
            UserDefaults.standard.set(vizinho.path,
                                      forKey: chave == chaveFFmpeg ? chaveFFprobe : chaveFFmpeg)
        }
    }

    /// Versão do ffmpeg, para mostrar na barra de status.
    static func versao(de url: URL) -> String? {
        let processo = Process()
        processo.executableURL = url
        processo.arguments = ["-version"]
        let saida = Pipe()
        processo.standardOutput = saida
        processo.standardError = Pipe()

        do { try processo.run() } catch { return nil }
        let dados = saida.fileHandleForReading.readDataToEndOfFile()
        processo.waitUntilExit()

        guard let texto = String(data: dados, encoding: .utf8),
              let primeira = texto.split(separator: "\n").first else { return nil }
        // "ffmpeg version 7.1 Copyright (c) ..." -> "7.1"
        let partes = primeira.split(separator: " ")
        if partes.count >= 3 { return String(partes[2]) }
        return String(primeira)
    }

    private static func noBundle(_ nome: String) -> URL? {
        if let url = Bundle.main.url(forResource: nome, withExtension: nil),
           executavel(url.path) {
            return url
        }
        if let url = Bundle.main.url(forAuxiliaryExecutable: nome),
           executavel(url.path) {
            return url
        }
        return nil
    }

    private static func executavel(_ caminho: String) -> Bool {
        var pasta: ObjCBool = false
        let gerenciador = FileManager.default
        guard gerenciador.fileExists(atPath: caminho, isDirectory: &pasta), !pasta.boolValue else {
            return false
        }
        return gerenciador.isExecutableFile(atPath: caminho)
    }
}
