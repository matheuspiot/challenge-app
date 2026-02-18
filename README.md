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

## Atualização automática (GitHub Releases)

O app usa `electron-updater` com `electron-builder` publicando no GitHub Releases.

- Verifica atualização automaticamente ao abrir o app.
- Se houver nova versão, faz download em background.
- Ao terminar, mostra modal:
  - `Nova versão disponível. Deseja reiniciar para atualizar?`
  - Botões: `Atualizar agora` e `Depois`.
- Também existe menu manual: `Ajuda > Verificar atualizações`.
- Status exibido na UI: `Verificando atualizações`, `Baixando X%`, `Atualização pronta`.

Observação:

- Banco SQLite permanece em `app.getPath("userData")`, então os dados não são perdidos ao atualizar.
- Para desativar auto update em testes locais:
  - Windows PowerShell: `$env:DISABLE_AUTO_UPDATE='1'; npm run dev`

## Fluxo de release (passo a passo)

### 1) Versionar

No `main/package.json`, incremente a versão:

- Exemplo: `1.0.0` -> `1.0.1`

### 2) Gerar build Windows

```bash
npm run dist:win
```

Arquivos de saída em `main/dist`:

- `Desafio de Corrida Setup <versão>.exe`
- `latest.yml` (metadados de update)
- `.blockmap`

### 3) Criar release no GitHub (público)

No repositório `https://github.com/matheuspiot/challenge-app`:

1. Crie uma release com tag exatamente igual à versão (`v1.0.1` recomendado).
2. Faça upload dos artefatos de `main/dist`:
   - instalador `.exe`
   - `latest.yml`
   - `.blockmap`
3. Publique a release como `Latest release`.

Como o repositório de releases é público, o app final não precisa token para baixar atualização.

### 4) Testar atualização entre versões

1. Instale a versão antiga (ex: `1.0.0`).
2. Publique a nova versão (ex: `1.0.1`) no GitHub Releases.
3. Abra o app `1.0.0`.
4. Verifique:
   - status: `Verificando atualizações` -> `Baixando ...%` -> `Atualização pronta`.
   - modal de reinício para atualizar.
5. Clique em `Atualizar agora` e confirme que abriu na nova versão.

### 5) Checklist de release

- Versão incrementada em `main/package.json`.
- `npm run build` sem erros.
- `npm run dist:win` gerou `exe + latest.yml + blockmap`.
- Release publicada no GitHub com artefatos corretos.
- Teste de update automático validado.

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

## Módulo de Inscrição e Pagamentos (Pix manual)

O sistema agora possui controle financeiro por atleta, operado apenas pelo organizador.

### Regras de bloqueio de KM

- O organizador só registra KM se o atleta estiver:
  - em dia, ou
  - com atraso de até 10 dias (tolerância).
- Se existir parcela vencida há mais de 10 dias:
  - a UI desabilita o botão de registrar KM;
  - o backend bloqueia via API/IPC (`PAYMENT_BLOCKED`);
  - o status é exibido como bloqueado por inadimplência.

### Cadastro financeiro do atleta

Ao cadastrar/editar atleta:

- valor total da inscrição (obrigatório)
- forma de pagamento (`à vista` ou `parcelado`)
- quantidade de parcelas (`2` a `12` para parcelado)
- data da primeira parcela

O sistema gera automaticamente parcelas mensais.

### Operações de pagamentos

- Marcar parcela como paga manualmente (Pix recebido)
- Reabrir parcela (voltar para em aberto), se necessário
- Status calculado por parcela:
  - `Em aberto`
  - `Pago`
  - `Vencido`
  - `Vencido há X dias`
  - `Bloqueado` (quando atraso > 10 dias)

### Novas telas no desafio

- `Pagamentos`: visualização de parcelas do atleta selecionado e ação de marcar pago
- `Pendências`: lista atletas com parcelas vencidas, com ação rápida de abrir atleta e marcar pago
- `Finanças`: resumo com:
  - total previsto
  - total recebido
  - total em aberto
  - inadimplência (atletas + valor)
  - lista de parcelas pagas
  - lista de parcelas vencidas

### Estrutura de banco adicionada

- `enrollments`
  - `id`
  - `athlete_id` (único)
  - `total_amount_cents`
  - `payment_type` (`cash`/`installments`)
  - `installments_count`
  - `first_due_date`
  - `created_at`
- `installments`
  - `id`
  - `enrollment_id`
  - `installment_number`
  - `due_date`
  - `amount_cents`
  - `paid_at`
  - `note`
  - `created_at`
  - `updated_at`

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
