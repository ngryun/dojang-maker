const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function setup({unsupported=false, denied=false, nullBlob=false}={}){
  const events={}, lifecycle={}, nodes={}, saved=[], renders=[], downloads=[];
  for(const id of ['save','copy','size','paper','saveNote']) nodes[id]={value:'1024',checked:false,disabled:false,addEventListener:(name,fn)=>events[id]=fn};
  let resolveFont;
  const fontReady=new Promise(r=>resolveFont=r);
  const blob={type:'image/png'};
  const state={text:'처음',suffix:'인',fontIdx:0,color:'#b3272d'};
  let clipboardCalls=0, item;
  const context={S:state,FONTS:[{}],$:id=>nodes[id],statusEl:{textContent:''},console:{error(){}},
    setTimeout:()=>1,clearTimeout(){}, STORE_KEY:'settings',CAN_STORE:true,
    localStorage:{setItem:(k,v)=>saved.push(JSON.parse(v))},
    ensureFont:()=>fontReady,render:(ctx,size,st)=>renders.push({size,st}),
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
