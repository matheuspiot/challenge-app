# Desafio de Corrida Desktop (Windows, Offline)

Aplicativo desktop para organizadores de desafios de corrida, substituindo planilha Excel.

## Stack

- Electron (desktop)
- React + Vite (interface)
- IPC no Electron (API local interna)
- SQLite local com `better-sqlite3`
- Hash de senha com `bcryptjs` (bcrypt)

## Estrutura do projeto

```text
.
├─ main/
│  ├─ src/
│  │  ├─ main.js          # Janela Electron + handlers IPC
│  │  ├─ preload.js       # API segura para o renderer
│  │  ├─ database.js      # Criação/abertura SQLite e schema
│  │  ├─ services.js      # Regras de negócio e validações
│  │  └─ logger.js        # Logs básicos
│  └─ package.json        # Electron + electron-builder
├─ renderer/
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ api.js
│  │  ├─ pages/
│  │  │  ├─ AuthPage.jsx
│  │  │  ├─ DashboardPage.jsx
│  │  │  └─ ChallengePage.jsx
│  │  └─ styles/app.css
│  ├─ index.html
│  └─ package.json
├─ package.json           # Scripts de orquestração (raiz)
└─ README.md
```

## Banco de dados local

Arquivo criado automaticamente em:

```text
%APPDATA%\Desafio de Corrida\database\desafios.db
```

Logs em:

```text
%APPDATA%\Desafio de Corrida\logs\app.log
```

Tabelas:

- `users`
- `challenges`
- `athletes`
- `activities`

Índices criados:

- `idx_challenges_user_id`
- `idx_athletes_challenge_id`
- `idx_activities_athlete_id`

## Pré-requisitos

- Node.js 20+
- Windows 10/11

## Instalação e execução (dev)

Na raiz do projeto:

```bash
npm install
npm run install:all
npm run dev
```

Isso sobe:

- `renderer` no Vite (`http://localhost:5173`)
- `main` com Electron apontando para o renderer

## Build de produção local

```bash
npm run build
```

## Gerar instalador Windows (.exe)

```bash
npm run dist:win
```

Saída:

```text
main/dist/Desafio de Corrida Setup 1.0.0.exe
```

## Funcionalidades implementadas (MVP)

- Cadastro/login local de organizador
- Desafios por organizador (isolamento por `user_id`)
- Cadastro de atletas por desafio
- Registro manual de km (data, km, observação)
- Ranking por total de km desc, empate por último registro mais antigo
- Progresso da meta geral e meta individual (quando existir)
- Exportação CSV do ranking
- Exportação CSV do histórico de atividades
- Backup do banco (`.db`)
- Restore do banco (`.db`)
- Interface em português com validações e mensagens de erro

## Comandos úteis

```bash
# raiz
npm run dev
npm run build
npm run dist:win

# apps separadas
npm run dev --prefix renderer
npm run dev --prefix main
```

## Observações técnicas

- O app é 100% offline, sem chamadas externas para dados do negócio.
- A comunicação UI <-> backend usa IPC (sem API HTTP aberta).
- O `electron-builder` está configurado para NSIS e instalador amigável.
- Dependência nativa `better-sqlite3` é recompilada automaticamente no empacotamento.

## Próximos incrementos recomendados

- Sessão persistente segura (lembrar login)
- Confirmações visuais antes de exclusões
- Relatórios adicionais (por período, por atleta)
- Testes automatizados (serviços e ranking)
