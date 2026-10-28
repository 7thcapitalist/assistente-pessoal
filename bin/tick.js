#!/usr/bin/env node
import { tick } from '../src/scheduler.js';

const only = process.argv[2];
const ran = await tick({ only, force: Boolean(only) });
for (const r of ran) console.log(`${r.ok ? 'ok ' : 'ERRO'} ${r.id}: ${r.result}`);
