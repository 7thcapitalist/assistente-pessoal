#!/usr/bin/env node
// Modo ausente: node bin/modo.mjs on|off|status. Quem liga é o João/Gerente; o tick só lê.
import { openDb } from '../src/db.mjs';
import { modoAusente, setModoAusente } from '../src/ausente.mjs';

const db = openDb(), a = process.argv[2];
if (a === 'on' || a === 'off') setModoAusente(db, a === 'on');
else if (a !== 'status') { console.error('uso: modo.mjs on|off|status'); process.exit(2); }
console.log(`Modo ausente: ${modoAusente(db) ? 'ATIVO' : 'DESLIGADO'}`);
