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

        tornarExecutavel(url)
        UserDefaults.standard.set(url.path, forKey: chave)

        // Se o usuário apontou o ffmpeg, o ffprobe quase sempre está do lado.
        let vizinho = url.deletingLastPathComponent()
            .appendingPathComponent(nome.contains("probe") ? "ffmpeg" : "ffprobe")
        tornarExecutavel(vizinho)
        if executavel(vizinho.path) {
            UserDefaults.standard.set(vizinho.path,
                                      forKey: chave == chaveFFmpeg ? chaveFFprobe : chaveFFmpeg)
        }
    }

    /// Descompactar pelo Finder às vezes tira a permissão de execução do
    /// arquivo. Como o usuário escolheu esse arquivo a dedo, devolvemos a
    /// permissão em vez de mandar ele abrir o Terminal para dar um chmod.
    static func tornarExecutavel(_ url: URL) {
        let gerenciador = FileManager.default
        guard gerenciador.fileExists(atPath: url.path),
              !gerenciador.isExecutableFile(atPath: url.path) else { return }
        try? gerenciador.setAttributes([.posixPermissions: 0o755], ofItemAtPath: url.path)
    }

    /// O macOS carimba todo arquivo baixado da internet com "quarentena".
    /// Enquanto ela estiver lá, o sistema recusa executar o binário — e o erro
    /// que aparece não explica isso, então detectamos para poder avisar direito.
    static func estaEmQuarentena(_ url: URL) -> Bool {
        getxattr(url.path, "com.apple.quarantine", nil, 0, 0, 0) > 0
    }

    /// Confere se o ffmpeg escolhido realmente executa neste Mac.
    /// Devolve nil quando está tudo certo, ou uma explicação do problema.
    static func diagnosticar(_ url: URL) -> String? {
        if !FileManager.default.fileExists(atPath: url.path) {
            return "Esse arquivo não existe mais no lugar onde estava."
        }
        if !FileManager.default.isExecutableFile(atPath: url.path) {
            return "Esse arquivo não tem permissão de execução e não consegui corrigir sozinho."
        }
        if versao(de: url) == nil {
            if estaEmQuarentena(url) {
                return "O macOS está bloqueando esse arquivo porque ele veio da internet. "
                    + "Abra Ajustes do Sistema → Privacidade e Segurança, role até o fim e "
                    + "clique em \"Abrir Mesmo Assim\" na mensagem sobre o ffmpeg. Depois volte "
                    + "aqui e clique em Verificar de novo."
            }
            return "Esse arquivo não roda neste Mac. Ele pode ser de outra arquitetura "
                + "(Intel × Apple Silicon) ou não ser o ffmpeg."
        }
        return nil
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
