#!/usr/bin/env node
'use strict';
/* ============================================================
   한자 변환 사전 생성기

   index.html 의 <script type="application/json" id="hanja-data"> 블록에 들어가는
   "읽기 → 한자 후보" 사전을 만든다. 브라우저에서 파일 하나로 돌아야 하므로 사전은
   index.html 안에 인라인으로 넣는다.

   쓰는 법
     1. 아래 자료를 tools/data/ 에 내려받는다 (git 에는 넣지 않는다).
        - Unihan_Readings.txt : https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip 안의 파일
        - hanja.txt, freq-hanja.txt :
          https://raw.githubusercontent.com/libhangul/libhangul/main/data/hanja/
     2. node tools/build-hanja-data.cjs --write      # index.html 의 블록 안쪽만 바꿔 넣는다
        node tools/build-hanja-data.cjs               # 표준 출력으로 JSON 만 찍는다
        옵션: --unihan/--hanja/--freq/--index <경로>, --out <파일>, --no-rare-hun (인명용 추가 한자의 훈 생략)

   출력 형식
     { "연": "姸고울·예쁠,延늘일,…;妍고울,…", … }
     - 항목은 쉼표로 나눈다. 항목의 첫 글자가 한자(BMP 1글자), 나머지가 훈(뜻). 훈은 없을 수 있고,
       여러 개면 '·' 로 잇는다(최대 2개).
     - 세미콜론 앞은 KS X 1001 한자(구글 폰트의 Noto Serif KR 이 실제로 서빙하는 범위),
       뒤는 대법원 인명용 추가 한자(웹 글씨체에 없어 컴퓨터의 한자 글꼴로 그려진다).
     - 읽기 키는 코드포인트 순, 한 줄에 한 읽기.

   자료 출처와 라이선스
     - Unihan Database, kHangul 필드 (읽기와 출처 태그: 0=KS X 1001, 1=KS X 1002, E=한문 교육용 기초 한자,
       N=대법원 인명용 한자, X=삭제됨)
       Copyright © 1991-2025 Unicode, Inc. All rights reserved.
       Distributed under the Terms of Use in https://www.unicode.org/copyright.html (Unicode License v3).
     - libhangul data/hanja/hanja.txt (훈), freq-hanja.txt (빈도)
       Copyright (c) 2005,2006 Choe Hwanjin
       All rights reserved.

       Redistribution and use in source and binary forms, with or without
       modification, are permitted provided that the following conditions are met:

       1. Redistributions of source code must retain the above copyright notice,
          this list of conditions and the following disclaimer.
       2. Redistributions in binary form must reproduce the above copyright notice,
          this list of conditions and the following disclaimer in the documentation
          and/or other materials provided with the distribution.
       3. Neither the name of the author nor the names of its contributors
          may be used to endorse or promote products derived from this software
          without specific prior written permission.

       THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
       AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
       IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
       ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
       LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
       CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
       SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
       INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
       CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
       ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
       POSSIBILITY OF SUCH DAMAGE.
   ============================================================ */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const OPEN_TAG = '<script type="application/json" id="hanja-data">';
const MAX_HUN = 2;          // 한 글자에 붙이는 훈의 최대 개수
const MAX_HUN_LEN = 10;     // 훈 하나의 최대 길이(코드포인트)

function usage(){
  console.error(`사용법: node tools/build-hanja-data.cjs [--write] [--out 파일] [--no-rare-hun]
        [--unihan 경로] [--hanja 경로] [--freq 경로] [--index 경로]
기본 입력: tools/data/Unihan_Readings.txt, tools/data/hanja.txt, tools/data/freq-hanja.txt`);
}
function fail(msg){ console.error('오류: ' + msg); process.exit(1); }

function parseArgs(argv){
  const o = {
    unihan: path.join(DATA_DIR, 'Unihan_Readings.txt'),
    hanja: path.join(DATA_DIR, 'hanja.txt'),
    freq: path.join(DATA_DIR, 'freq-hanja.txt'),
    index: path.join(ROOT, 'index.html'),
    out: null, write: false, rareHun: true,
  };
  for(let i = 0; i < argv.length; i++){
    const a = argv[i];
    if(a === '--write') o.write = true;
    else if(a === '--no-rare-hun') o.rareHun = false;
    else if(['--unihan', '--hanja', '--freq', '--index', '--out'].includes(a)){
      if(i + 1 >= argv.length) fail(a + ' 뒤에 경로가 필요합니다.');
      o[a.slice(2)] = argv[++i];
    }
    else if(a === '-h' || a === '--help'){ usage(); process.exit(0); }
    else { usage(); fail('알 수 없는 옵션: ' + a); }
  }
  return o;
}

/* ---- 글자 분류 ---- */
const isSyllable = s => /^[가-힣]$/.test(s);
/* 문자열이 BMP 한자 한 글자면 코드포인트, 아니면 -1. 호환한자(U+F900–FAFF)는 NFC 로 통합 한자가 된 뒤 판정된다. */
function hanjaCp(s){
  const cps = [...s];
  if(cps.length !== 1) return -1;
  const cp = cps[0].codePointAt(0);
  if((cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x4E00 && cp <= 0x9FFF)) return cp;
  return -1;
}

function readText(file, what){
  if(!fs.existsSync(file)) fail(`${what} 파일이 없습니다: ${file}\n${usageHint()}`);
  return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
}
function usageHint(){ return '자료 내려받는 법은 이 파일 맨 위 주석을 보세요.'; }

/* ---- Unihan: 글자 → [{reading, tags}] ---- */
function readUnihan(file){
  const text = readText(file, 'Unihan_Readings.txt');
  const byChar = new Map();
  let kHangulLines = 0, tagged = 0;
  for(const raw of text.split('\n')){
    if(!raw || raw[0] === '#') continue;
    const [cpStr, field, value] = raw.replace(/\r$/, '').split('\t');
    if(field !== 'kHangul' || !value) continue;
    kHangulLines++;
    const cp = parseInt(cpStr.slice(2), 16);
    if(!(cp > 0) || cp > 0xFFFF) continue;                 // BMP 밖 — 입력칸 maxlength(UTF-16 단위)와 어긋난다
    if(cp >= 0xF900 && cp <= 0xFAFF) continue;             // 호환한자 — 읽기는 통합 한자 쪽에 이미 있다
    if(hanjaCp(String.fromCodePoint(cp)) < 0) continue;
    const readings = [];
    for(const piece of value.normalize('NFC').trim().split(/\s+/)){
      const m = /^([가-힣]):([01ENX]+)$/.exec(piece);
      if(!m) continue;
      tagged++;
      const [, reading, tags] = m;
      if(!/[0EN]/.test(tags)) continue;                    // KS X 1002 전용·삭제된 읽기는 뺀다
      const prev = readings.find(r => r.reading === reading);
      if(prev) prev.tags += tags; else readings.push({reading, tags});
    }
    if(readings.length) byChar.set(String.fromCodePoint(cp), readings);
  }
  if(!kHangulLines) fail('kHangul 항목이 없습니다. Unihan_Readings.txt 가 맞는지 확인하세요.');
  if(!tagged) fail('kHangul 값에 출처 태그(:0EN)가 없습니다. Unicode 13.0 이상의 Unihan 이 필요합니다.');
  return byChar;
}

/* ---- libhangul hanja.txt: 훈 ---- */
function normalizeHun(desc){
  const out = [];
  for(let p of desc.split(',')){
    p = p.replace(/\([^)]*\)/g, '').replace(/[;<>"]/g, '').replace(/\s+/g, ' ').trim();
    if(!p) continue;
    if(isSyllable(p)) continue;                            // 음만 적힌 조각 ("각")
    if(/[㐀-䶿一-鿿豈-﫿]/.test(p)) continue;   // 이체자 설명 ("鄰의 俗字", "韌과 同字") 은 훈이 아니다
    p = p.replace(/\s+[가-힣]$/, '').trim();       // 끝의 음 제거: "아름다울 가" → "아름다울" (키와 다른 음도 있다: "경:擧:들 거")
    if(!p || [...p].length > MAX_HUN_LEN) continue;
    if(!out.includes(p)) out.push(p);
  }
  return out;
}
function readLibhangul(file){
  const text = readText(file, 'hanja.txt').normalize('NFC');
  const byPair = new Map();    // reading + ch → [훈]
  const byChar = new Map();    // ch → [훈]
  const add = (map, key, pieces) => {
    if(!pieces.length) return;
    const cur = map.get(key) || [];
    for(const p of pieces) if(!cur.includes(p)) cur.push(p);
    map.set(key, cur);
  };
  for(const raw of text.split('\n')){
    const line = raw.replace(/\r$/, '');
    if(!line || line[0] === '#') continue;
    const i = line.indexOf(':');
    if(i < 0) continue;
    const j = line.indexOf(':', i + 1);
    const key = line.slice(0, i);
    const ch = j < 0 ? line.slice(i + 1) : line.slice(i + 1, j);
    const desc = j < 0 ? '' : line.slice(j + 1);
    if(!isSyllable(key) || hanjaCp(ch) < 0) continue;      // 낱말 항목·한자가 아닌 것은 건너뛴다
    const pieces = normalizeHun(desc);
    add(byPair, key + ch, pieces);
    add(byChar, ch, pieces);
  }
  return {byPair, byChar};
}

/* ---- libhangul freq-hanja.txt: 빈도 ---- */
function readFreq(file){
  const freq = new Map();
  if(!fs.existsSync(file)){ console.error('참고: 빈도 파일이 없어 태그와 코드포인트 순으로만 정렬합니다: ' + file); return freq; }
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').normalize('NFC');
  for(const raw of text.split('\n')){
    const m = /^(.+?):(\d+)\s*$/.exec(raw.replace(/\r$/, ''));
    if(!m) continue;
    const n = +m[2];
    if(n > 0) freq.set(m[1], Math.max(n, freq.get(m[1]) || 0));
  }
  return freq;
}

/* ---- 병합 ---- */
function build(opts){
  const unihan = readUnihan(opts.unihan);
  const hun = readLibhangul(opts.hanja);
  const freq = readFreq(opts.freq);

  const pickHun = (reading, ch) => {
    const list = hun.byPair.get(reading + ch) || hun.byChar.get(ch) || [];
    return list.slice(0, MAX_HUN).join('·');
  };

  const groups = new Map();   // reading → entries
  for(const [ch, readings] of unihan){
    const served = readings.some(r => /[0E]/.test(r.tags));   // KS X 1001 — 웹 글씨체가 그릴 수 있는 글자
    for(const {reading, tags} of readings){
      const entry = {
        ch, cp: ch.codePointAt(0), served,
        edu: tags.includes('E'),
        freq: freq.get(ch) || 0,
        hun: pickHun(reading, ch),
      };
      if(!groups.has(reading)) groups.set(reading, []);
      groups.get(reading).push(entry);
    }
  }

  const byFreq = (a, b) => (b.freq - a.freq) || (a.cp - b.cp);
  const values = {};
  const stat = {readings: 0, entries: 0, common: 0, rare: 0, withHun: 0, chars: new Set(), rareChars: new Set()};
  for(const reading of [...groups.keys()].sort()){
    const entries = groups.get(reading);
    const common = entries.filter(e => e.served).sort((a, b) => ((a.edu ? 0 : 1) - (b.edu ? 0 : 1)) || byFreq(a, b));
    const rare = entries.filter(e => !e.served).sort(byFreq);
    if(!opts.rareHun) rare.forEach(e => { e.hun = ''; });
    if(!common.length && !rare.length) continue;

    const seen = new Set();
    for(const e of [...common, ...rare]){
      if(hanjaCp(e.ch) < 0) fail(`한자가 아닌 항목: ${reading} ${e.ch}`);
      if(/[,;]/.test(e.hun)) fail(`훈에 구분자가 있습니다: ${reading} ${e.ch} ${e.hun}`);
      if(seen.has(e.ch)) fail(`읽기 안에 같은 한자가 두 번: ${reading} ${e.ch}`);
      seen.add(e.ch);
      stat.entries++; stat.chars.add(e.ch);
      if(e.hun) stat.withHun++;
      if(e.served) stat.common++; else { stat.rare++; stat.rareChars.add(e.ch); }
    }
    stat.readings++;
    const enc = list => list.map(e => e.ch + e.hun).join(',');
    values[reading] = enc(common) + (rare.length ? ';' + enc(rare) : '');
  }
  return {values, stat};
}

function encode(values, eol){
  const keys = Object.keys(values);
  const blob = '{' + eol + keys.map(k => JSON.stringify(k) + ':' + JSON.stringify(values[k])).join(',' + eol) + eol + '}';
  if(/<\/script/i.test(blob) || blob.includes('<!--')) fail('출력에 HTML 을 깨뜨리는 문자열이 있습니다.');
  const back = JSON.parse(blob);
  for(const k of keys) if(back[k] !== values[k]) fail('JSON 왕복 검사 실패: ' + k);
  if(Object.keys(back).length !== keys.length) fail('JSON 왕복 검사 실패: 키 개수');
  return blob;
}

function main(){
  const opts = parseArgs(process.argv.slice(2));
  const {values, stat} = build(opts);

  let eol = '\n', html = null;
  if(opts.write){
    if(!fs.existsSync(opts.index)) fail('index.html 을 찾을 수 없습니다: ' + opts.index);
    html = fs.readFileSync(opts.index, 'utf8');
    eol = html.includes('\r\n') ? '\r\n' : '\n';
  }
  const blob = encode(values, eol);
  const bytes = Buffer.byteLength(blob, 'utf8');

  if(opts.write){
    const s = html.indexOf(OPEN_TAG);
    if(s < 0) fail(`index.html 에 ${OPEN_TAG} 블록이 없습니다.`);
    const contentStart = s + OPEN_TAG.length;
    const e = html.indexOf('</script>', contentStart);
    if(e < 0) fail('hanja-data 블록이 닫히지 않았습니다.');
    if(html.indexOf(OPEN_TAG, contentStart) >= 0) fail('hanja-data 블록이 두 개 이상입니다.');
    fs.writeFileSync(opts.index, html.slice(0, contentStart) + blob + html.slice(e));
    console.error(`index.html 의 hanja-data 블록을 새로 썼습니다.`);
  }else if(opts.out){
    fs.writeFileSync(opts.out, blob + eol);
    console.error(`${opts.out} 에 썼습니다.`);
  }else{
    process.stdout.write(blob + eol);
  }
  console.error(`읽기 ${stat.readings}개 · 항목 ${stat.entries}개 (한자 ${stat.chars.size}자) · KS X 1001 ${stat.common} / 인명용 추가 ${stat.rare} (${stat.rareChars.size}자) · 훈 있는 항목 ${stat.withHun} (${(stat.withHun / stat.entries * 100).toFixed(1)}%) · ${(bytes / 1024).toFixed(1)} KB`);
}

main();
