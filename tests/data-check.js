// Data + chart sanity check. Run: node tests/data-check.js .  (prints OK or FAIL n)
const fs=require('fs'),vm=require('vm');const dir=process.argv[2];
const ctx={window:{},console};vm.createContext(ctx);
for(const f of ['words','patterns','chart']) vm.runInContext(fs.readFileSync(dir+'/js/'+f+'.js','utf8'),ctx);
const {WORD_LISTS:L,PATTERNS:P,Chart:C}=ctx.window;let bad=0;
for(const l of L){ if(l.id==='mix') continue; const seen=new Map();
  for(const f of l.families){ if(f.words.length<4){console.log('SMALL',l.id,f.words.join(' '));bad++}
    for(const w of f.words){ if(seen.has(w)){console.log('DUP',l.id,w);bad++} seen.set(w,1)} } }
console.log('lists',L.map(l=>l.id+':'+l.families.length).join(' '));
// pattern checks
for(const p of P){ for(const [g,b] of p.beats) if(b<1||b>p.dur){console.log('BADBEAT',p.id);bad++}
  for(const fill of ['all','first','last','none']){ for(const bars of [8,16,64]){
    const ch=C.buildChart(bars,p,L[0],fill); if(ch.length!==bars*4){bad++;console.log('LEN')}
    const items=ch.filter(Boolean); if(fill==='none'&&items.length){bad++;console.log('NONE has items')}
    // expected slots
    const exp=[];for(let c0=0;c0<bars*4;c0+=p.dur) for(const [g,b] of p.beats) if(c0+b-1<bars*4) exp.push(c0+b-1);
    if(fill!=='none'){ const got=ch.map((x,i)=>x?i:-1).filter(i=>i>=0); if(got.join()!==exp.sort((a,b)=>a-b).join()){bad++;console.log('SLOTS',p.id,bars)}
      // per group words rhyme (same fam), unique words in a group
      const byKey={}; ch.forEach((x,i)=>{if(!x)return;const k=Math.floor(i/p.dur)+'-'+x.group;(byKey[k]??=[]).push(x)});
      for(const k in byKey){const g=byKey[k]; if(new Set(g.map(x=>x.famId)).size!==1){bad++;console.log('FAM MIX')} if(new Set(g.map(x=>x.word)).size!==g.length){bad++;console.log('WORD REPEAT',p.id,g.map(x=>x.word))}
        const shown=g.filter(x=>x.show).length; const want=fill==='all'?g.length:1; if(shown!==want){bad++;console.log('SHOW',fill,p.id,shown)} } } } } }
// no family repeat until exhausted (aabb, 64 bars basic => 32 groups > 23 fams)
const ch=C.buildChart(16,P[0],L[0],'all');const fams=[...new Set(ch.filter(Boolean).map(x=>x.famId))];console.log('aabb16 families',fams.length,'(want 8)');
console.log('sample', C.buildChart(8,P[0],L.find(l=>l.id==='newyear'),'all').map(x=>x?x.word:'·').join(' '));
console.log(bad?'FAIL '+bad:'OK');
