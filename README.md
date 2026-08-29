# BATPAPO 🦇

**Seu papo. Sua toca. Sua galera.**

Plataforma de comunicação social com identidade própria — inspirada na experiência de apps de mensagens e comunidades, com visual e personalidade únicos.

## Como executar

```bash
cd batpapo-app
python3 -m http.server 8765
# Abra http://localhost:8765
```

Ou qualquer servidor estático (Live Server, `npx serve`, etc.).

> **Importante:** precisa ser servido via HTTP (não `file://`) por causa dos ES modules.

## Conta demo

- **Usuário:** `mariana`
- **Senha:** `demo1234`

Outros usuários demo: `marcos`, `lucas`, `ana`, `rafa` (mesma senha).

## Funcionalidades

- Landing page com mascote Bati
- Cadastro e login (localStorage)
- BAT-ID único por usuário
- Dashboard com cards de resumo
- Chats privados (texto, emoji, stickers, imagens, arquivos, áudio)
- Respostas e reações
- Amigos por BAT-ID + solicitações
- Grupos com canais
- Laboratório de perfil (avatar, molduras, cores, bio, status)
- Notificações
- Temas (Bat Dark, Midnight, Vampire, Lilac, Neon, AMOLED)
- Configurações
- Dados persistidos em localStorage
- Responsivo (desktop + mobile)
- Empty states com o mascote

## Arquitetura

```
batpapo-app/
├── index.html
├── css/          # Design system (variáveis, componentes, layout, páginas)
├── js/
│   ├── app.js           # SPA principal (router + UI)
│   ├── services/        # Camada de dados (storage + store)
│   ├── data/demo.js     # Seed de demonstração
│   └── utils/           # Helpers + mascote SVG
└── assets/
```

A camada `services/` isola o armazenamento local. No futuro, troque `storage.js` / `store.js` por chamadas REST + WebSocket sem reescrever a UI.

## Stack

- HTML5 + CSS3 (custom properties, glassmorphism moderado)
- JavaScript ES modules (vanilla, sem framework)
- localStorage para persistência
- MediaRecorder API para áudio (quando suportado)

## Próximos passos (backend)

- API REST / GraphQL
- PostgreSQL
- JWT / sessões
- WebSocket (mensagens em tempo real + presença)
- Object storage para arquivos
- WebRTC para voz/vídeo
- Apps mobile e desktop
