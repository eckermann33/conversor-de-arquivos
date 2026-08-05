import SwiftUI
import AppKit

/// Uma linha da fila: nome, informações técnicas, progresso e ações.
struct LinhaDoVideo: View {
    @ObservedObject var job: VideoJob
    @EnvironmentObject private var fila: ConversionQueue

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Image(systemName: icone)
                    .foregroundStyle(corDoStatus)
                    .frame(width: 18)

                VStack(alignment: .leading, spacing: 2) {
                    Text(job.nome)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .font(.body.weight(.medium))

                    Text(detalhes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                if job.status == .convertendo {
                    Text("\(Int(job.progresso * 100))%")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                acoes
            }

            if job.status == .convertendo {
                ProgressView(value: job.progresso)
            }

            if case .falhou(let mensagem) = job.status {
                Text(mensagem)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
        .padding(.vertical, 6)
    }

    // MARK: - partes

    @ViewBuilder
    private var acoes: some View {
        if job.status == .concluido, let saida = job.saida {
            Button {
                NSWorkspace.shared.activateFileViewerSelecting([saida])
            } label: {
                Image(systemName: "folder")
            }
            .buttonStyle(.borderless)
            .help("Mostrar no Finder")

            Button {
                NSWorkspace.shared.open(saida)
            } label: {
                Image(systemName: "play.circle")
            }
            .buttonStyle(.borderless)
            .help("Abrir o vídeo convertido")
        }

        Button {
            fila.remover(job)
        } label: {
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(.tertiary)
        }
        .buttonStyle(.borderless)
        .help("Tirar da fila")
    }

    private var icone: String {
        switch job.status {
        case .aguardando:  return "clock"
        case .analisando:  return "magnifyingglass"
        case .convertendo: return "gearshape.2"
        case .concluido:   return "checkmark.circle.fill"
        case .cancelado:   return "slash.circle"
        case .falhou:      return "exclamationmark.triangle.fill"
        }
    }

    private var corDoStatus: Color {
        switch job.status {
        case .concluido: return .green
        case .falhou:    return .red
        case .cancelado: return .secondary
        default:         return .accentColor
        }
    }

    private var detalhes: String {
        var partes: [String] = [job.status.titulo]

        if let info = job.info {
            if info.duracao > 0 { partes.append(info.duracaoFormatada) }
            if !info.resumo.isEmpty { partes.append(info.resumo) }
        }

        partes.append(VideoJob.formatarTamanho(job.tamanhoOriginal))

        if job.status == .concluido {
            partes.append("→ " + VideoJob.formatarTamanho(job.tamanhoFinal))
            if let economia = job.economia { partes.append(economia) }
        }

        return partes.joined(separator: " · ")
    }
}
