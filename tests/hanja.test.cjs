// 한자 변환의 순수 함수와 인라인 사전 검사. 실행: node --test tests/hanja.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const PURE_START='/* ---- 한자 변환: 순수 함수 ---- */', PURE_END='/* ---- 한자 변환: 대화상자 ---- */';
const DATA_OPEN='<script type="application/json" id="hanja-data">';
const pure=script.slice(script.indexOf(PURE_START), script.indexOf(PURE_END));
const raw=html.match(/<script type="application\/json" id="hanja-data">([\s\S]*?)<\/script>/)[1];
const ctx=vm.createContext({});
vm.runInContext(pure, ctx);
const H=vm.runInContext('({parseHanjaData,buildHanjaRows,applyHanjaChoices,isHangulSyllable,isHanja,hasHanja,hasHangul,readingsOf,hanjaCandidates})', ctx);
const dict=H.parseHanjaData(raw);
// vm 컨텍스트에서 만든 객체는 프로토타입이 달라 deepEqual 이 실패하므로 값만 남긴다
const plain=v=>JSON.parse(JSON.stringify(v));

test('markers the tests slice on occur exactly once',()=>{
  for(const m of [PURE_START,PURE_END,'let saveTimer=0;','/* 저장된 값은','function sanitize(','/* ---- 시작 ---- */'])
    assert.equal(script.split(m).length-1,1,m);
  assert.equal(html.split(DATA_OPEN).length-1,1);
  assert.ok(pure.length>200);
});
test('inline dictionary is well formed',()=>{
  const data=JSON.parse(raw);
  const keys=Object.keys(data);
  assert.ok(keys.length>300,String(keys.length));
  const chars=new Set();
  for(const k of keys){
    assert.match(k,/^[가-힣]$/,k);
    const parts=data[k].split(';');
    assert.ok(parts.length<=2,k);
    for(const list of parts)for(const e of (list?list.split(','):[])){
      assert.ok(e.length>=1,k);
      assert.ok(H.isHanja(e[0]),k+' '+e);
      assert.equal(e[0].length,1,k+' '+e);                 // BMP — 입력칸 maxlength(UTF-16 단위)와 1:1
      assert.ok(!/[,;<]/.test(e.slice(1)),k+' '+e);
      chars.add(e[0]);
    }
  }
  assert.ok(chars.size>=4000,String(chars.size));
  assert.ok(!/<\/script/i.test(raw)&&!raw.includes('<!--'));
});
test('character classes',()=>{
  assert.equal(H.isHangulSyllable('연'),true);
  assert.equal(H.isHangulSyllable('ㅇ'),false);
  assert.equal(H.isHanja('妍'),true);
  assert.equal(H.isHanja('樂'),true);                  // 호환한자도 한자로 본다
  assert.equal(H.isHanja('연'),false);
  assert.equal(H.hasHanja('남궁妍'),true);
  assert.equal(H.hasHanja('남궁연'),false);
  assert.equal(H.hasHanja(''),false);
  assert.equal(H.hasHangul('南宮妍印'),false);
  assert.equal(H.hasHangul('南宮妍인'),true);
  assert.equal(H.hasHangul('ㄱ'),false);
});
test('candidates for 연·인, readings for 樂, compatibility ideographs',()=>{
  const c=H.hanjaCandidates(dict,'연');
  assert.ok(c.common.some(e=>e.ch==='姸'));               // KS X 1001 → 웹 글씨체로 그려진다
  assert.ok(c.common.some(e=>e.ch==='延'));
  assert.ok(c.rare.some(e=>e.ch==='妍'));                  // 인명용 추가 한자 → '더 보기' 뒤
  assert.ok(dict.rare.has('妍')&&!dict.rare.has('姸'));
  assert.ok(c.common.every(e=>e.rare===false)&&c.rare.every(e=>e.rare===true));
  assert.ok(H.hanjaCandidates(dict,'인').common.some(e=>e.ch==='印'&&e.hun.includes('도장')));
  assert.deepEqual(plain(H.readingsOf(dict,'樂')),['낙','락','악','요']);
  assert.deepEqual(plain(H.readingsOf(dict,'樂')),['낙','락','악','요']);   // NFC → 樂
  assert.deepEqual(plain(H.hanjaCandidates(dict,'뷁')),{common:[],rare:[]});
  assert.deepEqual(plain(H.readingsOf(dict,'A')),[]);
});
test('rows: only Hangul syllables and Hanja get a row',()=>{
  const rows=H.buildHanjaRows(dict,'남궁 연A');
  assert.deepEqual(plain(rows.map(r=>[r.i,r.ch,r.kind])),[[0,'남','hangul'],[1,'궁','hangul'],[3,'연','hangul']]);
  assert.deepEqual(plain(rows[2].groups.map(g=>g.reading)),['연']);
  assert.ok(rows[2].groups[0].common.length>10);
  const mixed=H.buildHanjaRows(dict,'南宮연');
  assert.deepEqual(plain(mixed.map(r=>r.kind)),['hanja','hanja','hangul']);
  assert.deepEqual(plain(mixed[0].groups.map(g=>g.reading)),['남']);
  assert.ok(!mixed[0].groups[0].common.some(e=>e.ch==='南'));   // 자기 자신은 후보에서 빠진다
  assert.ok(mixed[0].groups[0].common.some(e=>e.ch==='男'));
  assert.deepEqual(plain(H.buildHanjaRows(dict,'樂')[0].groups.map(g=>g.reading)),['낙','락','악','요']);
  assert.deepEqual(plain(H.buildHanjaRows(dict,'뷁')),[{i:0,ch:'뷁',kind:'hangul',groups:[{reading:'뷁',common:[],rare:[]}]}]);
  assert.deepEqual(plain(H.buildHanjaRows(dict,'ㄱ1a ')),[]);
  assert.deepEqual(plain(H.buildHanjaRows(dict,'䶶')[0].groups),[]);   // 사전에 없는 한자 → 그룹 없음
});
test('applyHanjaChoices replaces 1:1 and keeps UTF-16 length',()=>{
  const out=H.applyHanjaChoices('남궁연',[null,null,'妍']);
  assert.equal(out,'남궁妍');assert.equal(out.length,'남궁연'.length);
  assert.equal(H.applyHanjaChoices('南宮妍',['남']),'남宮妍');
  assert.equal(H.applyHanjaChoices('남궁 연',[null,'宮',null,'姸']),'남宮 姸');
  assert.equal(H.applyHanjaChoices('',[]),'');
});
test('FONTS entries match the Google Fonts link and have valid fallback chains',()=>{
  const c=vm.createContext({});
  const fontsEnd=script.indexOf('];',script.indexOf('const FONTS = ['))+2;
  vm.runInContext(script.slice(script.indexOf('const HANJA_GROUP='),fontsEnd),c);
  vm.runInContext(script.slice(script.indexOf('function fontSpec('),script.indexOf('async function ensureFont(')),c);
  const {FONTS,fontSpec}=vm.runInContext('({FONTS,fontSpec})',c);
  const link=html.match(/<link href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/)[1];
  const linked=new Set([...link.matchAll(/family=([^&:]+)/g)].map(m=>decodeURIComponent(m[1]).replace(/\+/g,' ')));
  const seen=new Set(), labels=new Set();
  for(const f of FONTS){
    if(!f.hidden) assert.ok(linked.has(f.fam),'구글 폰트 링크에 없는 글씨체: '+f.fam);
    for(const fb of [].concat(f.fb||[])) assert.ok(linked.has(fb),'링크에 없는 대체 글씨체: '+fb);
    if(f.hangul===false) assert.ok(f.hanja===true&&[].concat(f.fb||[]).length>0,'한자 전용인데 대체 글씨체가 없음: '+f.fam);
    const key=f.fam+'|'+f.w+'|'+[].concat(f.fb||[]).join('+');
    assert.ok(!seen.has(key),'같은 글씨체가 두 번: '+key);seen.add(key);
    assert.ok(!labels.has(f.label),'라벨 중복: '+f.label);labels.add(f.label);
  }
  assert.ok(FONTS.some(f=>f.hanja&&f.rare&&f.hangul!==false),"'인명용 한자까지' 글씨체가 없음");
  assert.ok(FONTS.filter(f=>f.hangul===false).length>=5);
  assert.equal(fontSpec(FONTS.find(f=>f.fam==='Yuji Syuku'),220),'400 220px "Yuji Syuku", "Noto Serif KR", "Noto Serif JP", serif');
  assert.equal(fontSpec(FONTS[0],100),'800 100px "Nanum Myeongjo", serif');
});
test('parseHanjaData tolerates bad or partial input',()=>{
  assert.equal(H.parseHanjaData('not json').byReading.size,0);
  assert.equal(H.parseHanjaData('').byReading.size,0);
  const d=H.parseHanjaData('{"연":";妍고울","락":"樂즐거울,"}');
  assert.deepEqual(plain(H.hanjaCandidates(d,'연')),{common:[],rare:[{ch:'妍',hun:'고울',rare:true}]});
  assert.deepEqual(plain(H.hanjaCandidates(d,'락')),{common:[{ch:'樂',hun:'즐거울',rare:false}],rare:[]});
  assert.ok(d.rare.has('妍')&&!d.rare.has('樂'));
});
