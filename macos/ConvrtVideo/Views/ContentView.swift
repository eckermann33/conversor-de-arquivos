import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var fila: ConversionQueue
    @State private var arrastando = false
    @State private var mostrarAjuda = false

    var body: some View {
        HStack(spacing: 0) {
            listaDeArquivos
            Divider()
            PainelDeAjustes()
                .frame(width: 300)
        }
        .toolbar { barraDeFerramentas }
        .sheet(isPresented: $mostrarAjuda) { TelaDeInstalacao() }
        .onAppear { if !fila.ffmpegDisponivel { mostrarAjuda = true } }
        .alert("Atenção", isPresented: Binding(
            get: { fila.aviso != nil },
            set: { if !$0 { fila.aviso = nil } }
        )) {
            Button("Ok") { fila.aviso = nil }
        } message: {
            Text(fila.aviso ?? "")
        }
    }

    // MARK: - lista

    private var listaDeArquivos: some View {
        VStack(spacing: 0) {
            if fila.jobs.isEmpty {
                areaVazia
            } else {
                List {
                    ForEach(fila.jobs) { job in
                        LinhaDoVideo(job: job)
                    }
                }
                .listStyle(.inset)
            }

            Divider()
            barraDeStatus
        }
        .frame(minWidth: 520)
        .background(arrastando ? Color.accentColor.opacity(0.12) : Color.clear)
        .onDrop(of: [UTType.fileURL], isTargeted: $arrastando) { provedores in
            receber(provedores)
        }
    }

    private var areaVazia: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "film.stack")
                .font(.system(size: 52))
                .foregroundStyle(.secondary)
            Text("Arraste seus vídeos para cá")
                .font(.title3.weight(.semibold))
            Text("MOD, TOD, MTS, M2TS, VOB, AVI, DV, MPG, WMV, 3GP, FLV, RM, MOV…\nTudo vira MP4 que abre em qualquer lugar.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Escolher arquivos…") {
                SelecionadorDeArquivos.abrir { fila.adicionar($0) }
            }
            .controlSize(.large)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    // MARK: - status

    private var barraDeStatus: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(fila.ffmpegDisponivel ? Color.green : Color.orange)
                .frame(width: 8, height: 8)

            if fila.ffmpegDisponivel {
                Text("ffmpeg \(fila.versaoFFmpeg ?? "pronto") · tudo roda no seu Mac, sem internet")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("ffmpeg não encontrado")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Resolver") { mostrarAjuda = true }
                    .buttonStyle(.link)
                    .font(.caption)
            }

            Spacer()

            if fila.convertendo {
                ProgressView(value: fila.progressoGeral)
                    .frame(width: 130)
                Text("\(Int(fila.progressoGeral * 100))%")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            } else if !fila.jobs.isEmpty {
                Text(resumoDaFila)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private var resumoDaFila: String {
        var partes: [String] = []
        if fila.totalNaFila > 0 { partes.append("\(fila.totalNaFila) na fila") }
        if fila.totalConcluido > 0 { partes.append("\(fila.totalConcluido) pronto(s)") }
        if fila.totalComErro > 0 { partes.append("\(fila.totalComErro) com erro") }
        return partes.joined(separator: " · ")
    }

    // MARK: - toolbar

    @ToolbarContentBuilder
    private var barraDeFerramentas: some ToolbarContent {
        ToolbarItemGroup {
            Button {
                SelecionadorDeArquivos.abrir { fila.adicionar($0) }
            } label: {
                Label("Adicionar", systemImage: "plus")
            }
            .help("Adicionar vídeos ou uma pasta inteira")

            Button {
                fila.limparConcluidos()
            } label: {
                Label("Limpar prontos", systemImage: "eraser")
            }
            .disabled(fila.totalConcluido == 0)

            Spacer()

            if fila.convertendo {
                Button(role: .destructive) {
                    fila.cancelar()
                } label: {
                    Label("Cancelar", systemImage: "stop.fill")
                }
            } else {
                Button {
                    fila.converterTudo()
                } label: {
                    Label("Converter tudo", systemImage: "play.fill")
                }
                .disabled(fila.totalNaFila == 0 || !fila.ffmpegDisponivel)
            }
        }
    }

    // MARK: - drop

    private func receber(_ provedores: [NSItemProvider]) -> Bool {
        let identificador = UTType.fileURL.identifier
        let relevantes = provedores.filter { $0.hasItemConformingToTypeIdentifier(identificador) }
        guard !relevantes.isEmpty else { return false }

        var urls: [URL] = []
        let trava = NSLock()
        let grupo = DispatchGroup()

        for provedor in relevantes {
            grupo.enter()
            provedor.loadItem(forTypeIdentifier: identificador, options: nil) { item, _ in
                defer { grupo.leave() }
                var url: URL?
                if let dados = item as? Data {
                    url = URL(dataRepresentation: dados, relativeTo: nil)
                } else if let direta = item as? URL {
                    url = direta
                }
                if let url {
                    trava.lock()
                    urls.append(url)
                    trava.unlock()
                }
            }
        }

        grupo.notify(queue: .main) {
            fila.adicionar(urls)
        }
        return true
    }
}
