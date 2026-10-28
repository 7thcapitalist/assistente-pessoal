#!/usr/bin/env node
// Painel web. HOST padrão 127.0.0.1; o serviço systemd passa o IP da tailnet (100.x) para não expor na rede local.
import { openDb } from '../src/db.mjs';
import { startServer } from '../src/server.mjs';

const port = Number(process.env.PORT || 4180), host = process.env.HOST || '127.0.0.1';
await startServer(openDb(), { port, host });
console.log(`painel em http://${host}:${port}`);
