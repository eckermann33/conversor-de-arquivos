import SwiftUI

struct PainelDeAjustes: View {
    @EnvironmentObject private var fila: ConversionQueue
    @State private var mostrarComando = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {

                grupo("Preset") {
                    Picker("", selection: $fila.ajustes.preset) {
                        ForEach(Preset.allCases) { preset in
                            Text(preset.titulo).tag(preset)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)

                    Text(fila.ajustes.preset.descricao)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if fila.ajustes.preset.recodifica {
                    grupo("Imagem") {
                        Picker("Resolução", selection: $fila.ajustes.resolucao) {
                            ForEach(Resolucao.allCases) { item in
                                Text(item.titulo).tag(item)
                            }
                        }

                        Picker("Girar", selection: $fila.ajustes.rotacao) {
                            ForEach(Rotacao.allCases) { item in
                                Text(item.titulo).tag(item)
                            }
                        }

                        Picker("Desentrelaçar", selection: $fila.ajustes.desentrelacar) {
                            ForEach(Desentrelacar.allCases) { item in
                                Text(item.titulo).tag(item)
                            }
                        }
                        Text("Filmagem de câmera antiga costuma ser entrelaçada: sem isso a imagem fica com listras horizontais em cena com movimento.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        Toggle("Corrigir proporção esticada", isOn: $fila.ajustes.corrigirProporcao)
                        Text("Conserta vídeo de MiniDV/VOB que aparece espremido ou esticado.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        Toggle("Normalizar para 30 fps", isOn: $fila.ajustes.normalizarFps)
                    }

                    if fila.ajustes.preset != .rapidoGPU {
                        grupo("Qualidade") {
                            HStack {
                                Text("melhor")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Slider(value: $fila.ajustes.qualidade, in: 14...30, step: 1)
                                Text("menor")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Text("CRF \(Int(fila.ajustes.qualidade)) — 18 é praticamente igual ao original, 23 é o padrão, acima de 26 começa a aparecer perda.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    grupo("Áudio") {
                        Picker("Taxa", selection: $fila.ajustes.bitrateAudio) {
                            Text("128 kbps").tag(128)
                            Text("192 kbps").tag(192)
                            Text("256 kbps").tag(256)
                            Text("320 kbps").tag(320)
                        }
                    }
                }

                grupo("Saída") {
                    HStack {
                        Text(nomeDaPasta)
                            .font(.caption)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Spacer()
                        Button("Mudar…") {
                            SelecionadorDeArquivos.escolherPasta { url in
                                fila.ajustes.pastaSaida = url
                            }
                        }
                        .controlSize(.small)
                    }

                    if fila.ajustes.pastaSaida != nil {
                        Button("Usar a pasta de cada vídeo") {
                            fila.ajustes.pastaSaida = nil
                        }
                        .controlSize(.small)
                        .buttonStyle(.link)
                    }

                    Toggle("Manter a data original do vídeo", isOn: $fila.ajustes.manterDataOriginal)

                    HStack {
                        Text("Sufixo")
                            .font(.caption)
                        TextField("ex.: -convertido", text: $fila.ajustes.sufixo)
                            .textFieldStyle(.roundedBorder)
                    }
                    Text("O arquivo original nunca é apagado nem sobrescrito.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                DisclosureGroup("Comando usado", isExpanded: $mostrarComando) {
                    Text(comandoExemplo)
                        .font(.system(size: 10, design: .monospaced))
                        .textSelection(.enabled)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.1))
                        .cornerRadius(6)
                }
                .font(.caption)
            }
            .padding(16)
        }
    }

    private func grupo<Conteudo: View>(_ titulo: String, @ViewBuilder _ conteudo: () -> Conteudo) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(titulo.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            conteudo()
        }
    }

    private var nomeDaPasta: String {
        fila.ajustes.pastaSaida?.lastPathComponent ?? "Ao lado do arquivo original"
    }

    private var comandoExemplo: String {
        let exemplo = fila.jobs.first?.entrada ?? URL(fileURLWithPath: "/Users/voce/Filmes/ferias.MOD")
        let destino = fila.ajustes.urlDeSaida(para: exemplo, evitandoColisao: false)
        return fila.ajustes.comandoLegivel(
            entrada: exemplo,
            saida: destino,
            info: fila.jobs.first?.info
        )
    }
}
