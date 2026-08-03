import SwiftUI
import AppKit

/// Aparece quando o app não acha o ffmpeg. Explica as três saídas possíveis
/// sem obrigar ninguém a caçar tutorial na internet.
struct TelaDeInstalacao: View {
    @EnvironmentObject private var fila: ConversionQueue
    @Environment(\.dismiss) private var fechar

    private let comandoHomebrew = "brew install ffmpeg"

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                Image(systemName: "wrench.and.screwdriver")
                    .font(.system(size: 30))
                    .foregroundStyle(.orange)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Falta o motor de conversão")
                        .font(.title2.weight(.semibold))
                    Text("O app usa o ffmpeg, que faz o trabalho pesado de decodificar formatos antigos.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            opcao(numero: "1", titulo: "Instalar com Homebrew (mais simples)") {
                Text("No Terminal, cole:")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack {
                    Text(comandoHomebrew)
                        .font(.system(.body, design: .monospaced))
                        .textSelection(.enabled)
                    Spacer()
                    Button("Copiar") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(comandoHomebrew, forType: .string)
                    }
                    .controlSize(.small)
                }
                .padding(10)
                .background(Color.secondary.opacity(0.1))
                .cornerRadius(6)
                Text("Se você ainda não tem o Homebrew, ele se instala em brew.sh.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            opcao(numero: "2", titulo: "Já baixei o ffmpeg (evermeet.cx, Downloads…)") {
                Button("Escolher o arquivo ffmpeg…") {
                    SelecionadorDeArquivos.escolherExecutavel { url in
                        fila.usarFFmpegEm(url)
                        if fila.ffmpegDisponivel { fechar() }
                    }
                }

                if let problema = fila.problemaFFmpeg {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(problema, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(.orange)
                            .fixedSize(horizontal: false, vertical: true)

                        if problema.contains("Privacidade") {
                            Button("Abrir Ajustes do Sistema") {
                                fila.abrirAjustesDeSeguranca()
                            }
                            .controlSize(.small)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.12))
                    .cornerRadius(6)
                }
            }

            opcao(numero: "3", titulo: "Embutir no app (funciona em qualquer Mac)") {
                Text("Rode `scripts/fetch-ffmpeg.sh` antes de compilar: ele baixa uma cópia do ffmpeg para dentro do app. Depois disso o app não depende de mais nada instalado.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

            HStack {
                Button("Verificar de novo") {
                    fila.verificarFFmpeg()
                    if fila.ffmpegDisponivel { fechar() }
                }
                .keyboardShortcut(.defaultAction)

                Spacer()

                Button("Fechar") { fechar() }
            }
        }
        .padding(24)
        .frame(width: 520)
    }

    private func opcao<Conteudo: View>(
        numero: String,
        titulo: String,
        @ViewBuilder _ conteudo: () -> Conteudo
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(numero)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(Color.accentColor))
                Text(titulo)
                    .font(.headline)
            }
            conteudo()
                .padding(.leading, 26)
        }
    }
}
