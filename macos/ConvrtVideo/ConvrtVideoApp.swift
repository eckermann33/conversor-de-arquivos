import SwiftUI
import AppKit

@main
struct ConvrtVideoApp: App {
    @StateObject private var fila = ConversionQueue()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(fila)
                .frame(minWidth: 900, minHeight: 580)
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Adicionar vídeos…") {
                    SelecionadorDeArquivos.abrir { urls in fila.adicionar(urls) }
                }
                .keyboardShortcut("o", modifiers: .command)
            }

            CommandMenu("Conversão") {
                Button("Converter tudo") { fila.converterTudo() }
                    .keyboardShortcut(.return, modifiers: .command)
                    .disabled(fila.convertendo || fila.totalNaFila == 0)

                Button("Cancelar") { fila.cancelar() }
                    .keyboardShortcut(".", modifiers: .command)
                    .disabled(!fila.convertendo)

                Divider()

                Button("Limpar concluídos") { fila.limparConcluidos() }
                Button("Limpar fila") { fila.limparTudo() }
                    .disabled(fila.jobs.isEmpty)
            }
        }
    }
}

/// Wrapper do NSOpenPanel — usado pelo menu e pelos botões da interface.
enum SelecionadorDeArquivos {
    static func abrir(_ aoEscolher: @escaping ([URL]) -> Void) {
        let painel = NSOpenPanel()
        painel.title = "Escolha os vídeos"
        painel.allowsMultipleSelection = true
        painel.canChooseFiles = true
        painel.canChooseDirectories = true
        painel.message = "Pode escolher uma pasta inteira — os vídeos de dentro entram na fila."
        painel.begin { resposta in
            guard resposta == .OK else { return }
            aoEscolher(painel.urls)
        }
    }

    static func escolherPasta(_ aoEscolher: @escaping (URL) -> Void) {
        let painel = NSOpenPanel()
        painel.title = "Pasta de destino"
        painel.canChooseFiles = false
        painel.canChooseDirectories = true
        painel.canCreateDirectories = true
        painel.begin { resposta in
            guard resposta == .OK, let url = painel.url else { return }
            aoEscolher(url)
        }
    }

    static func escolherExecutavel(_ aoEscolher: @escaping (URL) -> Void) {
        let painel = NSOpenPanel()
        painel.title = "Onde está o ffmpeg?"
        painel.message = "Normalmente em /opt/homebrew/bin/ffmpeg ou /usr/local/bin/ffmpeg. Use ⌘⇧G para digitar o caminho."
        painel.canChooseFiles = true
        painel.canChooseDirectories = false
        painel.showsHiddenFiles = true
        painel.treatsFilePackagesAsDirectories = true
        painel.begin { resposta in
            guard resposta == .OK, let url = painel.url else { return }
            aoEscolher(url)
        }
    }
}
