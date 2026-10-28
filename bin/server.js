#!/usr/bin/env node
import { createServer } from '../src/server.js';

const port = Number(process.env.PORT || 3737);
const host = process.env.HOST || '127.0.0.1';
createServer().listen(port, host, () => console.log(`painel em http://${host}:${port}`));
