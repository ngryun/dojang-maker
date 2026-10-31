const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function setup({unsupported=false, denied=false, nullBlob=false}={}){
  const events={}, lifecycle={}, nodes={}, saved=[], renders=[], downloads=[];
  for(const id of ['save','copy','copyWhite','saveSvg','share','shareSub','size','paper','saveNote','fontCss','inapp','showImg','longPressImg']) nodes[id]={value:'1024',checked:false,disabled:false,hidden:false,classList:{add(){}},addEventListener:(name,fn)=>events[id]=fn};
  let resolveFont;
  const fontReady=new Promise(r=>resolveFont=r);
  const blob={type:'image/png'};
  const state={text:'처음',suffix:'인',fontIdx:0,color:'#b3272d'};
  let clipboardCalls=0, item;
  const context={S:state,FONTS:[{}],$:id=>nodes[id],statusEl:{textContent:'',dataset:{}},console:{error(){}},
    setTimeout:()=>1,clearTimeout(){}, STORE_KEY:'settings',CAN_STORE:true,
    localStorage:{setItem:(k,v)=>saved.push(JSON.parse(v))},
    ensureFont:()=>fontReady,ensureStampFonts:()=>fontReady,render:(ctx,size,st)=>renders.push({size,st}),
    URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    window:{addEventListener:(name,fn)=>lifecycle[name]=fn},
    document:{visibilityState:'visible',addEventListener:(name,fn)=>lifecycle[name]=fn,
      body:{appendChild(){}},createElement:tag=>tag==='canvas'?{getContext:()=>({}),toBlob:fn=>fn(nullBlob?null:blob)}:{click(){downloads.push(this.download)},remove(){}}},
    navigator:{clipboard:unsupported?undefined:{write(items){clipboardCalls++;item=items[0];return denied?Promise.reject(new Error('denied')):item.data['image/png'].then(()=>{});}}},
    ClipboardItem:class{constructor(data){this.data=data}}
  };
  if(!unsupported) context.window.ClipboardItem=context.ClipboardItem;
  vm.createContext(context);
  vm.runInContext(script.slice(script.indexOf('let saveTimer=0;'),script.indexOf('/* 저장된 값은')),context);
  vm.runInContext(script.slice(script.indexOf('function sanitize('),script.indexOf('/* ---- 시작 ---- */')),context);
  return {context,events,lifecycle,nodes,saved,renders,downloads,resolveFont,state,get clipboardCalls(){return clipboardCalls}};
}
test('inline JavaScript parses',()=>new vm.Script(script));
test('download uses the clicked settings and size after an asynchronous font load',async()=>{
  const app=setup(); const pending=app.events.save();
  assert.equal(app.nodes.save.disabled,true);
  app.state.text='변경';app.state.color='#000000';app.nodes.size.value='2048';
  app.resolveFont();await pending;
  assert.equal(app.renders[0].st.text,'처음');assert.equal(app.renders[0].st.color,'#b3272d');
  assert.equal(app.renders[0].size,1024);assert.equal(app.downloads[0],'도장_처음인_1024.png');
  assert.match(app.context.statusEl.textContent,/1024px/);assert.equal(app.nodes.save.disabled,false);
});
test('clipboard write starts synchronously before fonts finish, with a snapshot',async()=>{
  const app=setup();const pending=app.events.copy();
  assert.equal(app.clipboardCalls,1);assert.equal(app.renders.length,0);
  app.state.text='변경';app.resolveFont();await pending;
  assert.equal(app.renders[0].st.text,'처음');assert.match(app.context.statusEl.textContent,/복사했습니다/);
});
test('unsupported copy returns guidance without rendering',async()=>{
  const app=setup({unsupported:true});await app.events.copy();
  assert.equal(app.renders.length,0);assert.match(app.context.statusEl.textContent,/PNG 저장/);
  assert.equal(app.nodes.copy.disabled,false);
});
test('clipboard denial restores buttons and explains the fallback',async()=>{
  const app=setup({denied:true});await app.events.copy();app.resolveFont();
  assert.equal(app.nodes.copy.disabled,false);assert.match(app.context.statusEl.textContent,/PNG 저장/);
});
test('null PNG result reports an error and restores buttons',async()=>{
  const app=setup({nullBlob:true});const pending=app.events.save();app.resolveFont();await pending;
  assert.equal(app.downloads.length,0);assert.match(app.context.statusEl.textContent,/이미지를 만들지 못했습니다/);
  assert.equal(app.nodes.save.disabled,false);
});
test('page hide and backgrounding immediately preserve the latest settings',()=>{
  const app=setup();app.state.text='마지막';app.nodes.paper.checked=true;
  app.lifecycle.pagehide();assert.equal(app.saved[0].text,'마지막');assert.equal(app.saved[0].paper,true);
  app.context.document.visibilityState='hidden';app.state.text='최신';app.lifecycle.visibilitychange();
  assert.equal(app.saved[1].text,'최신');
});
test('storage write failure is visible without throwing',()=>{
  const app=setup();app.context.localStorage.setItem=()=>{throw new Error('quota')};
  assert.doesNotThrow(()=>app.lifecycle.pagehide());assert.match(app.nodes.saveNote.textContent,/저장하지 못했습니다/);
});
test('pngSetDpi inserts a pHYs chunk after IHDR, replaces an old one, and leaves non-PNG data alone',()=>{
  const {context}=setup();
  const zlib=require('node:zlib');
  const chunk=(type,data)=>{const t=Buffer.from(type,'latin1');const len=Buffer.alloc(4);len.writeUInt32BE(data.length);
    const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(Buffer.concat([t,data])));return Buffer.concat([len,t,data,crc]);};
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=chunk('IHDR',Buffer.alloc(13)), idat=chunk('IDAT',Buffer.from([1,2,3])), iend=chunk('IEND',Buffer.alloc(0));
  const ppm=context.pixelsPerMetre(256,15);
  assert.equal(ppm,17067);
  const out=Buffer.from(context.pngSetDpi(new Uint8Array(Buffer.concat([sig,ihdr,idat,iend])),ppm));
  const phys=Buffer.alloc(9);phys.writeUInt32BE(ppm,0);phys.writeUInt32BE(ppm,4);phys[8]=1;
  assert.deepEqual(out,Buffer.concat([sig,ihdr,chunk('pHYs',phys),idat,iend]));
  // 이미 pHYs 가 있으면 새 값으로 바꾼다
  const old=chunk('pHYs',Buffer.from([0,0,0,1,0,0,0,1,1]));
  const out2=Buffer.from(context.pngSetDpi(new Uint8Array(Buffer.concat([sig,ihdr,old,idat,iend])),ppm));
  assert.deepEqual(out2,out);
  // PNG 가 아니면 그대로
  const junk=new Uint8Array([1,2,3]);
  assert.equal(context.pngSetDpi(junk,ppm),junk);
});
