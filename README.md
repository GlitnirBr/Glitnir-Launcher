# Glitnir Launcher

Launcher oficial do servidor Valheim Glitnir.

## Download

**[Baixar Glitnir Launcher](https://github.com/luizgseixas/Glitnir-Launcher/releases/latest)** (Windows)

Acesse a página de Releases e baixe o arquivo `.exe` mais recente.

---

## Funcionalidades

- Gerenciamento automático de mods do servidor
- Atualização com um clique
- Notícias e eventos do servidor
- Seleção entre Vanilla e modpacks
- Interface estilo Battle.net

## Tecnologias

- Electron 28
- React 18 + TypeScript
- Vite 5

## Para Desenvolvedores

### Setup inicial

```bash
npm install
npm run dev
```

### Build local (.exe)

```bash
npm run build
# Gera release/Glitnir Launcher Setup.exe
```

### Build via GitHub Actions

O projeto compila automaticamente quando você cria uma tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

O `.exe` será publicado automaticamente na página de Releases.

---

## Estrutura do projeto

```
glitnir-launcher/
├── electron/
│   ├── main.ts        ← Processo principal (Node.js / APIs do sistema)
│   └── preload.ts     ← Bridge segura entre Electron e React
├── src/
│   ├── components/    ← Componentes React (Sidebar, TitleBar, News, etc.)
│   ├── views/         ← Páginas (Home, Mods, Settings, Admin)
│   ├── utils/         ← Funções utilitárias (modManager, etc.)
│   ├── types/         ← Interfaces TypeScript
│   └── App.tsx
└── .github/workflows/ ← GitHub Actions para build automático
```

## Configuração do Modpack

O launcher busca o modpack de uma URL configurável (GitHub Gist recomendado).

Exemplo de `modpack.json`:
```json
{
  "version": "1.0.0",
  "updatedAt": "2026-06-04",
  "changelog": [
    {
      "version": "1.0.0",
      "date": "2026-06-04",
      "changes": ["Primeira versão do modpack"]
    }
  ],
  "mods": [
    {
      "name": "BepInExPack Valheim",
      "version": "5.4.2200",
      "thunderstoreId": "denikson-BepInExPack_Valheim"
    }
  ]
}
```

## Como funciona

O launcher cria um perfil isolado em:
```
%APPDATA%/GlitnirLauncher/profiles/Glitnir/BepInEx/
```

E lança o Valheim passando o BepInEx do perfil como argumento:
```
valheim.exe --doorstop-enable true --doorstop-target <perfil>/BepInEx/core/BepInEx.dll
```

Isso garante que a instalação original do Valheim nunca é modificada.
