// Run with Playwright available: node tests/design.test.cjs
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:960}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    const images=[];
    for(const [preset,label] of [['modern','미니멀'],['classic','클래식 이중선'],['brush','붓글씨 낙관']]){
      await page.locator('[data-preset="'+preset+'"]').click();
      await page.waitForFunction(()=>!pending);
      await page.evaluate(async()=>{await ensureFont(FONTS[S.fontIdx],S.text+S.suffix);render(vctx,view.width,S)});
      assert.equal(await page.locator('#text').inputValue(),'남궁연');
      images.push({label,data:await page.locator('#view').evaluate(c=>c.toDataURL())});
    }
    await page.locator('[data-preset="classic"]').click();
    await page.waitForFunction(()=>!pending);
    assert.equal(await page.locator('#doubleBorder').isChecked(),true);
    await page.evaluate(()=>flushState());await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#doubleBorder').isChecked(),true);
    assert.equal(await page.locator('#spacing').inputValue(),'7');
    const edges=await page.evaluate(()=>{
      const results=[];const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      for(const shape of ['circle','ellipse','rounded','square'])for(const rot of [-15,0,15]){
        render(ctx,256,{...S,shape,rot,rough:100,ink:0});
        const pixels=ctx.getImageData(0,0,256,256).data;
        let count=0,painted=0;
        for(let y=0;y<256;y++)for(let x=0;x<256;x++){
          if(pixels[(y*256+x)*4+3]){painted++;if(x<5||x>250||y<5||y>250)count++;}
        }
        results.push({shape,rot,count,painted});
      }
      return results;
    });
    for(const result of edges){assert.equal(result.count,0,JSON.stringify(result));assert.ok(result.painted>100)}
    // 한자 변환: 남궁연 → 남궁妍. 妍 은 인명용 추가 한자라 '더 보기' 뒤에 나온다.
    await page.locator('#hanjaBtn').click();
    await page.waitForSelector('#hanjaDlg[open]');
    assert.equal(await page.locator('#hanjaRows .hj-row').count(),3);
    const row=page.locator('#hanjaRows .hj-row[data-i="2"]');
    if(!await row.locator('button[data-ch="妍"]').count())await row.locator('.hj-more').click();
    await row.locator('button[data-ch="妍"]').click();
    assert.equal(await page.locator('#hjPreview').textContent(),'남궁妍 · 印');
    await page.locator('#hjApply').click();
    await page.waitForFunction(()=>!document.getElementById('hanjaDlg').open&&!pending);
    assert.equal(await page.locator('#text').inputValue(),'남궁妍');
    // 妍 은 인명용 추가 한자 → '인명용 한자까지' 글씨체(KR + JP 보완)로 바꿔 준다
    assert.deepEqual(await page.evaluate(()=>[S.text,S.suffix,!!FONTS[S.fontIdx].hanja,!!FONTS[S.fontIdx].rare]),['남궁妍','印',true,true]);
    await page.waitForFunction(()=>/바꾼 글자/.test(document.getElementById('hanjaNote').textContent)&&!/불러오는 중/.test(document.getElementById('hanjaNote').textContent));
    assert.equal(await page.evaluate(()=>document.fonts.check('900 220px "Noto Serif KR"','남궁印')),true);
    assert.equal(await page.evaluate(()=>document.fonts.check('900 220px "Noto Serif JP"','妍')),true);
    assert.equal(await page.locator('#fontNote').textContent(),'');
    // 한자 전용 글씨체: 한자는 그 글꼴로, 한글은 노토 세리프로. 한글이 섞이면 글씨체 아래에 안내가 뜬다.
    // 글씨체 고르기: 타일 격자를 펼치면 글씨체마다 지금 글자(한자 전용은 한자만)가 그 글꼴로 보인다
    assert.match(await page.locator('#fontCurSample').textContent(),/^남궁妍$/);
    await page.locator('#fontToggle').click();
    await page.waitForSelector('#fontGrid:not([hidden])');
    const shown=await page.evaluate(()=>FONTS.filter(f=>!f.hidden).length);
    assert.equal(await page.locator('#fontGrid .fp-tile').count(),shown);
    assert.equal(await page.locator('#fontGrid .fp-tile[aria-pressed="true"]').count(),1);
    const yuji=await page.evaluate(()=>FONTS.findIndex(f=>f.fam==='Yuji Syuku'));
    const yujiTile=page.locator('#fontGrid .fp-tile[data-idx="'+yuji+'"]');
    // 타일마다 지금 설정으로 찍은 도장이 그려진다 — 유지 슈쿠 타일 캔버스에 실제로 칠해진 픽셀이 있어야 한다
    await page.waitForFunction(i=>{
      const c=document.querySelector('#fontGrid .fp-tile[data-idx="'+i+'"] canvas');
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let n=0;for(let k=3;k<d.length;k+=4)if(d[k]>0)n++;return n>2000;
    },yuji);
    await yujiTile.click();
    await page.waitForFunction(i=>S.fontIdx===i,yuji);
    assert.equal(await yujiTile.getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('#fontCurName').textContent(),/유지 슈쿠/);
    await page.evaluate(async()=>{await ensureFont(FONTS[S.fontIdx],S.text+S.suffix);render(vctx,view.width,S);schedule()});
    await page.waitForFunction(()=>!pending);
    assert.equal(await page.evaluate(()=>document.fonts.check(fontSpec(FONTS[S.fontIdx],220),S.text+S.suffix)),true);
    assert.match(await page.locator('#fontNote').textContent(),/한글이 없어/);
    await page.fill('#text','南宮妍');
    await page.waitForFunction(()=>!pending);
    assert.equal(await page.locator('#fontNote').textContent(),'');
    await page.fill('#text','남궁妍');
    await page.locator('#fontGrid .fp-tile[data-idx="3"]').click();   // 노토 세리프 KR — 妍 이 없으니 안내가 뜬다
    await page.waitForFunction(()=>S.fontIdx===3);
    assert.match(await page.locator('#fontCurSample').evaluate(el=>getComputedStyle(el).fontFamily),/Noto Serif KR/);
    await page.locator('#fontToggle').click();                         // 접기
    await page.waitForSelector('#fontGrid[hidden]',{state:'attached'});
    await page.evaluate(()=>schedule());await page.waitForFunction(()=>!pending);
    assert.match(await page.locator('#fontNote').textContent(),/인명용 추가 한자/);
    await page.setViewportSize({width:360,height:780});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    // 좁은 화면에서 대화상자: 가로 스크롤 없음, 이미 한자인 글자는 '그대로' 가 선택돼 있음, 칩과 버튼이 화면 안에 들어옴
    await page.locator('#hanjaBtn').click();
    await page.waitForSelector('#hanjaDlg[open]');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('#hanjaRows .hj-row[data-i="2"] .hj-chip.keep[aria-pressed="true"]').count(),1);
    const chip=await page.locator('#hanjaRows .hj-chip').first().boundingBox();
    assert.ok(chip.height>=44&&chip.x>=0&&chip.x+chip.width<=360,JSON.stringify(chip));
    const apply=await page.locator('#hjApply').boundingBox();
    assert.ok(apply.y+apply.height<=780,JSON.stringify(apply));
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.getElementById('hanjaDlg').open);
    assert.equal(await page.locator('#text').inputValue(),'남궁妍');
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:1200,height:550});
    await page.evaluate(images=>{
      document.body.innerHTML='';document.body.style.cssText='margin:0;background:#f6f1e7;padding:32px;font-family:serif';
      const gallery=document.createElement('div');gallery.style.cssText='display:flex;gap:24px';
      for(const image of images){const card=document.createElement('div');card.style.cssText='flex:1;text-align:center;background:#fffdf8;border:1px solid #e0d7c4;border-radius:12px;padding:20px';
        const img=document.createElement('img');img.src=image.data;img.style.cssText='width:100%;display:block';
        const title=document.createElement('h2');title.textContent=image.label;title.style.cssText='font-size:20px;margin:12px 0 0;color:#5d554a';card.append(img,title);gallery.append(card)}
      document.body.append(gallery);
    },images);
    if(process.env.DESIGN_PREVIEW_PATH)await page.screenshot({path:process.env.DESIGN_PREVIEW_PATH});
    console.log('PASS: 3 presets, settings restored, 12 shape/rotation clipping checks, hanja conversion (desktop + 360px dialog), 360px layout, no page errors.');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
