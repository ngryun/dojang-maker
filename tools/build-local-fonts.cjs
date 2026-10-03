#!/usr/bin/env node
'use strict';
/* ============================================================
   직접 올리는 글씨체(구글 폰트에 없는 무료 공공 글씨체) 웹 글꼴 생성기

   원본 TTF 를 구글 폰트처럼 글자 범위별 woff2 조각으로 나눠 fonts/<slug>/ 에 쓰고,
   index.html 의 <style id="localFonts"> 블록 안쪽(@font-face 목록)을 바꿔 넣는다.
   조각마다 unicode-range 를 적으므로 브라우저는 입력한 글자가 든 조각만 받는다.
   (원본 한 벌이 3~12MB — 통째로 받게 하면 너무 무겁다)

   쓰는 법
     1. 원본 TTF 를 tools/data/fonts/ 에 아래 FONTS 의 file 이름으로 둔다 (git 에는 넣지 않는다).
        - 강원교육 서체: https://www.gwe.go.kr/main/content.do?key=bTIzMDcyMTEyMDc3MTU=
        - 경기천년체:    https://www.gg.go.kr/contents/contents.do?ciIdx=679&menuId=2457
        - 전남교육 서체: https://www.jne.go.kr/main/cm/cntnts/cntntsView.do?mi=1778&cntntsId=620
        - 인천교육 서체: https://www.ice.go.kr/ice/cm/cntnts/cntntsView.do?mi=10874&cntntsId=943
     2. npm i --no-save subset-font
     3. node tools/build-local-fonts.cjs

   저작권 (각 누리집의 안내)
   - 강원교육 서체(강원특별자치도교육청): 누구나 무료로 자유롭게 사용, 웹 등에 특별한 허가 절차 없이 사용 가능(출처 표기 권장).
     유료로 양도하거나 판매하는 등의 상업적 행위는 금지.
   - 경기천년체(경기도): 누구나 무료로 자유롭게 사용, 웹에 사용하거나 프로그램에 탑재하여 배포 가능.
     폰트 자체를 그대로 판매하거나 유료로 양도하는 행위는 금지. 공공누리 제1유형(출처표시).
   - 전남교육 서체(전라남도교육청): 누구나 무료로 자유롭게 사용(출처표기 권장), 웹 사용·프로그램에 탑재하여 배포 가능.
     유료로 양도·판매하는 행위는 금지.
   - 인천교육 서체(인천광역시교육청): 누구나 무료로 자유롭게 사용(출처 표기 권장), 웹 등에 특별한 허가 절차 없이 사용 가능.
     유료로 양도하거나 판매하는 등의 상업적 행위는 금지.
   ============================================================ */
const fs=require('node:fs');
const path=require('node:path');
const subsetFont=require('subset-font');

const ROOT=path.join(__dirname, '..');
const SRC=path.join(__dirname, 'data/fonts');
const OUT=path.join(ROOT, 'fonts');
const INDEX=path.join(ROOT, 'index.html');

/* fam 은 index.html 의 FONTS 와 같아야 한다.
   hangulPerChunk: 획이 복잡해 글자당 용량이 큰 손글씨 글꼴은 조각을 잘게 나눠 한 조각이 80KB 안팎이 되게 한다. */
const FONTS=[
  { file:'GangwonEduModu-Bold.ttf',   slug:'gangwon-modu-bold',  fam:'Gangwon Edu Modu Bold' },
  { file:'GangwonEduModu-Light.ttf',  slug:'gangwon-modu-light', fam:'Gangwon Edu Modu Light' },
  { file:'GangwonEduTeunteun.ttf',    slug:'gangwon-teunteun',   fam:'Gangwon Edu Teunteun' },
  { file:'GangwonEduHyeonokSaem.ttf', slug:'gangwon-hyeonok',    fam:'Gangwon Edu Hyeonok' },
  { file:'GangwonEduSaeeum.ttf',      slug:'gangwon-saeeum',     fam:'Gangwon Edu Saeeum' },
  { file:'GyeonggiBatang-Bold.ttf',   slug:'gyeonggi-batang-bold',    fam:'Gyeonggi Batang Bold' },
  { file:'GyeonggiBatang-Regular.ttf',slug:'gyeonggi-batang-regular', fam:'Gyeonggi Batang Regular' },
  { file:'GyeonggiTitle-Bold.ttf',    slug:'gyeonggi-title-bold',     fam:'Gyeonggi Title Bold' },
  { file:'JeonnamEduDobak-ExtraBold.ttf', slug:'jeonnam-dobak',        fam:'Jeonnam Edu Dobak' },
  { file:'JeonnamEduBareun-Bold.ttf',     slug:'jeonnam-bareun-bold',  fam:'Jeonnam Edu Bareun Bold' },
  { file:'JeonnamEduBareun-Light.ttf',    slug:'jeonnam-bareun-light', fam:'Jeonnam Edu Bareun Light' },
  { file:'JeonnamEduYuna.ttf',            slug:'jeonnam-yuna',         fam:'Jeonnam Edu Yuna' },
  { file:'IncheonEduSimin.ttf',   slug:'incheon-simin',   fam:'Incheon Edu Simin', hangulPerChunk:240 },
  { file:'IncheonEduSotong.ttf',  slug:'incheon-sotong',  fam:'Incheon Edu Sotong', hangulPerChunk:240 },
  { file:'IncheonEduHimchan.ttf', slug:'incheon-himchan', fam:'Incheon Edu Himchan', hangulPerChunk:240 },
  { file:'IncheonEduJaram.ttf',   slug:'incheon-jaram',   fam:'Incheon Edu Jaram', hangulPerChunk:240 },
];

/* 글꼴에 실제로 있는 글자(cmap). 형식 4·12 유니코드 하위표를 읽는다. */
function codepoints(buf){
  const dv=new DataView(buf.buffer, buf.byteOffset, buf.length), cps=new Set();
  const n=dv.getUint16(4);
  let cmap=-1;
  for(let i=0;i<n;i++){ const o=12+i*16; if(dv.getUint32(o)===0x636D6170) cmap=dv.getUint32(o+8); }
  if(cmap<0) throw new Error('cmap 표가 없습니다');
  const nt=dv.getUint16(cmap+2);
  for(let i=0;i<nt;i++){
    const pid=dv.getUint16(cmap+4+i*8), eid=dv.getUint16(cmap+6+i*8), so=cmap+dv.getUint32(cmap+8+i*8);
    if(!(pid===0 || (pid===3 && (eid===1 || eid===10)))) continue;
    const fmt=dv.getUint16(so);
    if(fmt===4){
      const seg=dv.getUint16(so+6)/2, e=so+14, s=e+seg*2+2, d=s+seg*2, r=d+seg*2;
      for(let k=0;k<seg;k++){
        const end=dv.getUint16(e+k*2), start=dv.getUint16(s+k*2), delta=dv.getInt16(d+k*2), ro=dv.getUint16(r+k*2);
        for(let cp=start; cp<=end && cp!==0xFFFF; cp++){
          let g;
          if(!ro) g=(cp+delta)&0xFFFF;
          else { g=dv.getUint16(r+k*2+ro+2*(cp-start)); if(g) g=(g+delta)&0xFFFF; }
          if(g) cps.add(cp);
        }
      }
    }else if(fmt===12){
      const groups=dv.getUint32(so+12);
      for(let k=0;k<groups;k++){ const o=so+16+k*12; for(let cp=dv.getUint32(o); cp<=dv.getUint32(o+4); cp++) cps.add(cp); }
    }
  }
  return [...cps].sort((a,b)=>a-b);
}

/* 조각: 0 은 한글·한자 밖의 글자(영문·문장부호·자모 …), 그다음 한글 음절, 한자 순.
   한글·한자 조각은 실제 있는 글자를 같은 개수씩 나누고 unicode-range 는 [첫 글자, 끝 글자] 하나로 적는다. */
const HANGUL_PER_CHUNK=480, HANJA_PER_CHUNK=320;
const isHangul=c=>c>=0xAC00 && c<=0xD7A3;
const isHanja=c=>(c>=0x3400 && c<=0x9FFF) || (c>=0xF900 && c<=0xFAFF) || (c>=0x20000 && c<=0x3FFFF);
function split(list, size){
  const out=[], k=Math.ceil(list.length/size), per=Math.ceil(list.length/k);
  for(let i=0;i<list.length;i+=per) out.push(list.slice(i, i+per));
  return out;
}
function runs(list){                    // [1,2,3,7] → [[1,3],[7,7]]
  const out=[];
  for(const c of list){ const last=out[out.length-1]; if(last && c===last[1]+1) last[1]=c; else out.push([c,c]); }
  return out;
}
function chunks(cps, hangulPerChunk=HANGUL_PER_CHUNK){
  const out=[];
  const other=cps.filter(c=>c>=0x20 && !isHangul(c) && !isHanja(c));
  if(other.length) out.push({cps:other, ranges:runs(other)});
  for(const part of [...split(cps.filter(isHangul), hangulPerChunk), ...split(cps.filter(isHanja), HANJA_PER_CHUNK)])
    out.push({cps:part, ranges:[[part[0], part[part.length-1]]]});
  return out;
}
const hex=n=>n.toString(16).toUpperCase();
const rangeText=ranges=>ranges.map(([a,b])=>a===b ? 'U+'+hex(a) : `U+${hex(a)}-${hex(b)}`).join(',');

(async()=>{
  const rules=[];
  let total=0;
  for(const f of FONTS){
    const src=fs.readFileSync(path.join(SRC, f.file));
    const dir=path.join(OUT, f.slug);
    fs.rmSync(dir, {recursive:true, force:true});
    fs.mkdirSync(dir, {recursive:true});
    const parts=chunks(codepoints(src), f.hangulPerChunk);
    let size=0;
    for(let i=0;i<parts.length;i++){
      const woff2=await subsetFont(src, String.fromCodePoint(...parts[i].cps), {targetFormat:'woff2'});
      fs.writeFileSync(path.join(dir, i+'.woff2'), woff2);
      size+=woff2.length;
      rules.push(`@font-face{font-family:'${f.fam}';font-weight:400;font-display:swap;src:url(fonts/${f.slug}/${i}.woff2) format('woff2');unicode-range:${rangeText(parts[i].ranges)}}`);
    }
    total+=size;
    console.error(`${f.fam}: 조각 ${parts.length}개, ${(size/1024/1024).toFixed(2)}MB`);
  }
  const html=fs.readFileSync(INDEX, 'utf8');
  const re=/(<style id="localFonts">\n)[^<]*(<\/style>)/;   // 블록 안에는 '<' 가 없다 — 다음 </style> 을 넘어가지 않게
  if(!re.test(html)) throw new Error('index.html 에 <style id="localFonts"> 블록이 없습니다');
  fs.writeFileSync(INDEX, html.replace(re, (m, a, b)=>a+rules.join('\n')+'\n'+b));
  console.error(`woff2 합계 ${(total/1024/1024).toFixed(1)}MB, @font-face ${rules.length}개를 index.html 에 넣었습니다.`);
})().catch(e=>{ console.error(e); process.exitCode=1; });
