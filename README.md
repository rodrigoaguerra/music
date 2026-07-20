# 🎵 Music Player

Reprodutor de música local que roda inteiramente no navegador — sem backend, sem upload, sem conta. Você aponta uma pasta do seu computador ou celular e o player lê, organiza e toca os arquivos de áudio direto do disco.

## 📸 Demonstração

[Acessar Music Player](https://music.rodrigoalvesguerra.com.br)

## ✨ Funcionalidades

- 📂 Importação de pastas completas (seletor nativo ou arrastar-e-soltar)
- 🔁 Fila de reprodução com shuffle, repeat (tudo / uma faixa) e remoção de itens
- 💾 Biblioteca persistente entre sessões, sem duplicar os arquivos de áudio
- 🌊 Waveform interativo para buscar posição na faixa
- 🎨 Capas de álbum geradas proceduralmente em canvas — cada faixa tem uma seed única
- 📱 Instalável como app (PWA), com cache offline do app shell
- 🔒 Controles de mídia nativos do sistema — play/pause/próxima na tela de bloqueio e em fones bluetooth
- ⏳ Indicador de progresso ao importar pastas grandes
- ⌨️ Atalhos de teclado

## ⌨️ Atalhos de teclado

| Tecla | Ação |
|---|---|
| `Espaço` | Play / Pause |
| `→` | Próxima faixa |
| `←` | Faixa anterior (reinicia a atual se já passou de 3s) |
| `S` | Ativa/desativa shuffle |
| `R` | Alterna entre repetir tudo / repetir uma / desativado |

## 🧠 Como funciona

### Duas estratégias de importação
O botão "Adicionar pasta" se comporta de forma diferente dependendo do navegador:

- **Chrome, Edge e outros navegadores baseados em Chromium (desktop)**: usa a **File System Access API** (`showDirectoryPicker`). O app guarda apenas uma *referência* (`FileSystemFileHandle`) a cada arquivo, não os bytes do áudio — o que permite restaurar a biblioteca inteira em sessões futuras.
- **Todos os outros navegadores** (Firefox, Safari e qualquer navegador mobile, nenhum com suporte a essa API até o momento): cai automaticamente num fallback via `<input webkitdirectory>` ou drag-and-drop. A reprodução funciona igual, mas a fila não persiste entre sessões.

### Persistência sem duplicar arquivos
Os metadados de cada faixa (título, artista, duração e o *handle* de acesso ao arquivo) ficam salvos no **IndexedDB** (`idb.js`). Nenhum áudio é copiado pro banco. Ao reabrir o app, ele tenta restaurar a fila e, se a permissão de leitura tiver expirado, mostra um banner pedindo pra reconectar as pastas — restrição de segurança do próprio navegador, que exige uma ação explícita do usuário pra reconceder acesso.

### PWA (instalável e com cache offline)
`manifest.json` + `sw.js` cacheiam o *app shell* — HTML, CSS, JS e ícones — permitindo instalação na tela inicial e carregamento offline do player em si. Os arquivos de música continuam vindo do disco do usuário; o cache não armazena áudio.

### Controles do sistema (Media Session API)
O player expõe metadados (título, artista, capa) e handlers de play/pause/próxima/anterior pra a **Media Session API**, fazendo o navegador mostrar os controles na tela de bloqueio e em dispositivos bluetooth, tanto no Android quanto no iOS.

### Arte gerada proceduralmente
Não há imagens externas: cada capa é desenhada em `<canvas>` a partir de uma seed numérica derivada do nome/caminho e tamanho do arquivo, garantindo uma composição visual consistente por faixa sem depender de nenhum asset.

## 🛠️ Stack

- JavaScript vanilla (sem frameworks nem bundler)
- HTML5 + CSS3 (Grid, custom properties)
- Canvas API (waveform e artwork)
- IndexedDB (persistência de metadados)
- File System Access API (referências de arquivo persistentes)
- Media Session API (controles do sistema)
- Service Worker + Web App Manifest (PWA)

## 📁 Estrutura do projeto

```
├── index.html
├── style.css
├── app.js
├── idb.js
├── sw.js
├── manifest.json
└── assets/
    ├── icon-192.png
    ├── icon-512.png
    └── icon-512-maskable.png
```

## ▶️ Como rodar localmente

O Service Worker e a File System Access API exigem um **contexto seguro** — abrir o `index.html` direto pelo `file://` não funciona corretamente. Sirva a pasta com qualquer servidor estático:

```bash
# Python
python3 -m http.server 8000

# Node, sem instalar nada globalmente
npx serve .
```

Depois acesse `http://localhost:8000` (ou a porta indicada) no navegador.

## 🌐 Compatibilidade

| Recurso | Chrome / Edge / Opera (desktop) | Firefox, Safari e navegadores mobile |
|---|---|---|
| Tocar músicas de uma pasta | ✅ | ✅ (via seletor de arquivos) |
| Persistência da fila entre sessões | ✅ | ❌ — precisa reimportar a cada sessão |
| Controles na tela de bloqueio / bluetooth | ✅ | ✅ |
| Instalar como app (PWA) | ✅ | ✅ (suporte varia por navegador) |

## ⚠️ Limitações conhecidas

- A File System Access API não tem suporte em nenhum navegador mobile, nem no Firefox/Safari desktop — nesses casos a biblioteca não persiste entre sessões.
- O navegador exige uma ação explícita do usuário (clique em "Reconectar") pra reconceder acesso às pastas salvas; não é possível pedir automaticamente ao carregar a página.
- O drag-and-drop ainda usa `webkitGetAsEntry()`, que gera arquivos não-persistentes mesmo em navegadores Chromium — só o fluxo pelo botão "Adicionar pasta" usa handles persistentes.

## 🗺️ Possíveis próximos passos

- Persistir também o fluxo de drag-and-drop em navegadores Chromium, trocando `webkitGetAsEntry()` por `getAsFileSystemHandle()`.
- Extração real de metadados (tags ID3 / Vorbis comments) em vez de inferir título/artista pelo nome do arquivo.
- Reordenação manual da fila via drag-and-drop entre itens.

## 📄 Licença

GNU GENERAL PUBLIC LICENSE 2.0

## 👤 Autor

Desenvolvido por **Rodrigo Alves Guerra** — [rodrigoalvesguerra.com.br](https://rodrigoalvesguerra.com.br)