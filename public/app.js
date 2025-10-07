(function(){
  // Dynamic background (aurora-like blobs)
  const c=document.getElementById('bg'); const ctx=c.getContext('2d');
  function resize(){ c.width=innerWidth; c.height=innerHeight; } resize(); addEventListener('resize', resize);
  const blobs = Array.from({length:4}).map((_,i)=>({x:Math.random()*c.width,y:Math.random()*c.height,r:180+Math.random()*240,dx:(Math.random()*1.2+0.3)*(Math.random()<.5?-1:1),dy:(Math.random()*1.2+0.3)*(Math.random()<.5?-1:1),h: (i*90+200)%360}));
  const particles = Array.from({length:40}).map(()=>({x:Math.random()*c.width,y:Math.random()*c.height,v: .3+Math.random()*1.2,s:1+Math.random()*2}));
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    ctx.globalCompositeOperation='lighter';
    for(const b of blobs){
      const grd=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
      const col1=`hsla(${b.h},95%,65%,.12)`; const col2=`hsla(${(b.h+60)%360},95%,55%,.06)`;
      grd.addColorStop(0,col1); grd.addColorStop(1,col2);
      ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
      b.x+=b.dx; b.y+=b.dy;
      if(b.x-b.r<0||b.x+b.r>c.width) b.dx*=-1;
      if(b.y-b.r<0||b.y+b.r>c.height) b.dy*=-1;
    }
    // particles
    ctx.globalCompositeOperation='screen';
    ctx.fillStyle='rgba(150,180,255,.35)';
    for(const p of particles){ ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill(); p.y += p.v; if(p.y>c.height+10){ p.y=-10; p.x=Math.random()*c.width; } }
    requestAnimationFrame(draw);
  }
  draw();

  // Chat logic
  const SID_KEY='hs_sid', ENDED_KEY='hs_ended', UID_KEY='hs_uid', RESUME_KEY='hs_resume';
  let LOADED=false;
  function newSid(){ return (Date.now().toString(36)+Math.random().toString(36).slice(2,8)); }

  // ✅ 提前初始化 uid
  let uid=(localStorage.getItem(UID_KEY)||'').trim();

  function sidKey(){ return SID_KEY + '_' + (uid||''); }
  let sid=null;
  function ensureSid(){ const k=sidKey(); sid=localStorage.getItem(k)||newSid(); localStorage.setItem(k,sid); }
  ensureSid();

  let ended=(localStorage.getItem(ENDED_KEY)==='1');
  const INACTIVE_MS=15*60*1000; let idleTimer=null;

  const msgs=document.getElementById('msgs'), input=document.getElementById('input'), sendBtn=document.getElementById('send');
  const fileInput=document.getElementById('file'), btnEnd=document.getElementById('btn-end'), composer=document.getElementById('composer');
  const uidModal=document.getElementById('uidModal'), uidInput=document.getElementById('uidInput'), uidOk=document.getElementById('uidOk');
  const toast=document.getElementById('toast');
  const AGENT_AVATAR='/agent.png';
  
  // ---- secure resume token (per device) ----
  function getResumeToken(){
    let t = localStorage.getItem(RESUME_KEY);
    if(!t){
      t = (Date.now().toString(36)+Math.random().toString(36).slice(2,12));
      localStorage.setItem(RESUME_KEY, t);
    }
    return t;
  }
  function histKey(){ return 'hs_hist_' + getResumeToken() + '_' + (uid||''); }
  let REPLAY=false;
  function loadHistory(){
    try{
      const raw = localStorage.getItem(histKey());
      const arr = raw ? JSON.parse(raw) : [];
      msgs.innerHTML=''; REPLAY=true; arr.forEach(m=>{
        if(m.type==='text') addMsg(m.text, m.me);
        else if(m.type==='img'){
          if(m.url){ addImage(m.url, m.caption||'', m.me); }
          else { addMsg((m.me?'(You) ':'')+'[image]', m.me); }
        }
      }); REPLAY=false;
    }catch(e){/* ignore */}
  }
  function pushHistory(item){
    try{
      const raw = localStorage.getItem(histKey());
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(item);
      while(arr.length>200) arr.shift();
      localStorage.setItem(histKey(), JSON.stringify(arr));
    }catch(e){/* ignore */}
  }
  // ---- inline resume pill ----
  function loadHistoryOnce(){ if(LOADED) return; loadHistory(); LOADED=true; }
  function showResumePill(){
    const pill = document.createElement('div');
    pill.className = 'resume-pill';
    pill.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7-11-7z" /></svg><span>Resume</span>';
    pill.addEventListener('click', ()=>{
      fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'continue'})}).then(()=>{
        setEnded(false);
        composer.style.display='flex';
        showToast('resumed','Resumed');
        pill.remove();
        resetIdle();
      });
    });
    msgs.appendChild(pill);
    msgs.scrollTop=msgs.scrollHeight;
  }

  function showToast(kind, text){
    const icons = {
      connected: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="url(#g)"/><path d="M7 12l3 3 7-7" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      resumed:   '<svg viewBox="0 0 24 24"><defs><linearGradient id="gp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ea9ff"/><stop offset="1" stop-color="#8b5cff"/></linearGradient></defs><path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="url(#gp)" stroke-width="2" fill="none"/><path d="M21 5v6h-6" stroke="url(#gp)" stroke-width="2" fill="none"/></svg>',
      ended:     '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#ff5a6b" stroke-width="2" fill="none"/><path d="M12 5v7" stroke="#ff5a6b" stroke-width="2"/></svg>',
      toolarge:  '<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2L12 3z" fill="#f7c948"/><path d="M12 9v5" stroke="#1b2738" stroke-width="2"/><circle cx="12" cy="16" r="1.2" fill="#1b2738"/></svg>',
      failed:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff5a6b"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2"/></svg>'
    };
    toast.innerHTML = (icons[kind]||'') + (text? '<span style="margin-left:8px">'+text+'</span>':'');
    toast.style.animation = 'none'; toast.offsetHeight;
    toast.classList.add('show');
    if(kind==='toolarge'){ toast.style.animation = 'shake .5s ease'; setTimeout(()=>toast.classList.remove('show'), 2400); }
    else { setTimeout(()=>toast.classList.remove('show'), 2400); }
  }

  // ... （后面部分逻辑保持不变）
})();
function invalidUIDFeedback(){
  uidInput.classList.remove('shake');
  uidInput.classList.add('invalid','shake');
  setTimeout(()=>uidInput.classList.remove('shake'),450);
}

