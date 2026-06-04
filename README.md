# Glitnir Launcher

Launcher oficial do servidor Valheim Glitnir.

## Tecnologias
- Electron 28
- React 18 + TypeScript
- Vite 5

## Estrutura do projeto

```
glitnir-launcher/
├── electron/
│   ├── main.ts        ← Processo principal (Node.js / APIs do sistema)
│   └── preload.ts     ← Bridge segura entre Electron e React
├── src/
│   ├── components/
│   │   ├── Login/     ← Tela de login
│   │   ├── Home/      ← Layout principal + sidebar
│   │   ├── TitleBar/  ← Barra de título customizada
│   │   └── Tabs/      ← TabGlitnir, TabVanilla, TabAdmin
│   ├── utils/
│   │   ├── auth.ts        ← Login/logout com backend
│   │   └── modManager.ts  ← Fetch modpack, download, comparação de versões
│   ├── types/
│   │   └── index.ts   ← Interfaces TypeScript
│   ├── App.tsx
│   └── main.tsx
├── modpack.example.json  ← Exemplo do modpack.json (hospedar no GitHub)
└── package.json
```

## Setup inicial

```bash
npm install
npm run dev
```

## Build (.exe)

```bash
npm run build
# Gera release/Glitnir Launcher Setup.exe
```

## Configurações necessárias

### 1. URL do modpack.json
Em `src/utils/modManager.ts`, altere:
```ts
const MODPACK_URL = 'https://raw.githubusercontent.com/SEU_USER/glitnir-modpack/main/modpack.json'
```

### 2. URL de autenticação
Em `src/utils/auth.ts`, altere:
```ts
const AUTH_URL = 'https://api.seuservidor.com/auth'
```

### 3. Links do Discord e GitHub
Em `TabAdmin.tsx` e `Login.tsx`, atualize os links do servidor.

## Como funciona o lançamento do jogo (estilo R2 Modman)

O launcher cria um perfil isolado em:
```
%APPDATA%/GlitnirLauncher/profiles/Glitnir/BepInEx/
```

E lança o Valheim passando o BepInEx do perfil como argumento:
```
valheim.exe --doorstop-enable true --doorstop-target <perfil>/BepInEx/core/BepInEx.dll
```

Isso garante que a instalação original do Valheim nunca é modificada.
