(function(){
  // ===== Background (保持你原有视觉，不改样式) =====
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
    ctx.globalCompositeOperation='screen';
    ctx.fillStyle='rgba(150,180,255,.35)';
    for(const p of particles){ ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill(); p.y += p.v; if(p.y>c.height+10){ p.y=-10; p.x=Math.random()*c.width; } }
    requestAnimationFrame(draw);
  }
  draw();

  // ===== Chat logic =====
  const SID_KEY='hs_sid', ENDED_KEY='hs_ended', UID_KEY='hs_uid', RESUME_KEY='hs_resume';
  let LOADED=false;
  function newSid(){ return (Date.now().toString(36)+Math.random().toString(36).slice(2,8)); }

  // 先初始化 uid，再用于 sidKey()
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

  // --- typing indicator state ---
  let TYPING = { el:null, timer:null, dots:1, hideTimer:null };

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
    }catch(e){}
  }
  function pushHistory(item){
    try{
      const raw = localStorage.getItem(histKey());
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(item);
      while(arr.length>200) arr.shift();
      localStorage.setItem(histKey(), JSON.stringify(arr));
    }catch(e){}
  }
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

  // === 将纯文本里的 URL / 邮箱转为 <a>（安全：不执行 HTML，仅拼装节点） ===
  function makeLinkifiedFragment(text) {
    const frag = document.createDocumentFragment();
    const urlRegex = /((https?:\/\/|www\.)[^\s]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

    let last = 0, m;
    while ((m = urlRegex.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const raw = m[0];
      let href, label = raw;
      if (raw.includes('@') && !raw.startsWith('www.')) {
        href = 'mailto:' + raw;
      } else {
        href = raw.startsWith('http') ? raw : ('https://' + raw);
      }
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'msg-link';
      frag.appendChild(a);
      last = m.index + raw.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function addMsg(text,me){
    const d=document.createElement('div'); d.className='msg'+(me?' me':'');
    if(!me){ const av=document.createElement('img'); av.src=AGENT_AVATAR; av.className='avatar'; d.appendChild(av); }
    const span=document.createElement('div');
    span.appendChild(makeLinkifiedFragment(text));
    d.appendChild(span);
    msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; 
    if(!REPLAY){ try{ pushHistory({type:'text', text, me:!!me}); }catch(e){} }
  }

  function addAgentCard(contentNode){
    // 和客服消息一致的容器，用于放“选择语言卡片”
    const d=document.createElement('div'); d.className='msg';
    const av=document.createElement('img'); av.src=AGENT_AVATAR; av.className='avatar'; d.appendChild(av);
    const box=document.createElement('div'); box.appendChild(contentNode); d.appendChild(box);
    msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight;
    return d;
  }

  function addImage(url,caption,me){
    const wrap=document.createElement('div'); wrap.className='msg'+(me?' me':'');
    if(!me){ const av=document.createElement('img'); av.src=AGENT_AVATAR; av.className='avatar'; wrap.appendChild(av); }
    const box=document.createElement('div'); const img=document.createElement('img'); img.src=url; img.alt=caption||''; box.appendChild(img);
    if(caption){ const c=document.createElement('div'); c.className='caption'; c.textContent=caption; box.appendChild(c); }
    wrap.appendChild(box); msgs.appendChild(wrap); msgs.scrollTop=msgs.scrollHeight; 
    if(!REPLAY){ try{ pushHistory({type:'img', url:(me?null:url), caption, me:!!me}); }catch(e){} }
  }

  // ===== 正在输入：显示/隐藏 =====
  function showTyping(){
    if (TYPING.el) return;
    const d = document.createElement('div');
    d.className = 'msg';
    const av = document.createElement('img'); av.src = AGENT_AVATAR; av.className = 'avatar'; d.appendChild(av);
    const span = document.createElement('div'); span.textContent = '...'; d.appendChild(span);
    msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
    TYPING.el = span;
    TYPING.dots = 1;
    TYPING.timer = setInterval(()=>{ TYPING.dots = (TYPING.dots % 3) + 1; TYPING.el.textContent='.'.repeat(TYPING.dots); }, 400);
    clearTimeout(TYPING.hideTimer); TYPING.hideTimer = setTimeout(hideTyping, 10000); // 10s 兜底
  }
  function hideTyping(){
    if (TYPING.timer) { clearInterval(TYPING.timer); TYPING.timer=null; }
    if (TYPING.hideTimer) { clearTimeout(TYPING.hideTimer); TYPING.hideTimer=null; }
    if (TYPING.el) {
      const wrap = TYPING.el.parentElement;
      if (wrap && wrap.parentElement) wrap.parentElement.removeChild(wrap);
    }
    TYPING.el = null;
  }

  // ===== 语言选择流程 =====
  const LANG_KEY_PREFIX = 'hs_lang_'; // 按会话存储选择的语言
  const LANGS = [
    { code:'zh-CN', label:'简体中文', flag:'🇨🇳', greet:'你好，有什么可以帮您？' },
    { code:'en',    label:'English',  flag:'🇺🇸', greet:'Hello! How can I help you?' },
    { code:'th',    label:'ไทย',      flag:'🇹🇭', greet:'สวัสดีครับ/ค่ะ ต้องการให้ช่วยอะไรบ้างคะ/ครับ?' },
    { code:'es',    label:'Español',  flag:'🇪🇸', greet:'¡Hola! ¿En qué puedo ayudarte?' },
    { code:'ar',    label:'العربية',  flag:'🇸🇦', greet:'مرحبًا! كيف يمكنني مساعدتك؟' }
  ];
  function langStorageKey(){ return LANG_KEY_PREFIX + sid; }

  function greetByLanguage(code){
    const found = LANGS.find(l=>l.code===code) || LANGS[0];
    if(found.code==='ar'){
      // 简单 RTL 处理：放一个 dir=rtl 的包裹
      const wrapper = document.createElement('div'); 
      wrapper.setAttribute('dir','rtl');
      wrapper.textContent = found.greet;
      const d=document.createElement('div'); d.className='msg';
      const av=document.createElement('img'); av.src=AGENT_AVATAR; av.className='avatar'; d.appendChild(av);
      const box=document.createElement('div'); box.appendChild(wrapper); d.appendChild(box);
      msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight;
      return;
    }
    addMsg(found.greet, false);
  }

  function showLanguagePicker(){
    // 创建卡片内容
    const card = document.createElement('div');
    // 不改你的全局样式，仅用最小内联，保持“气泡”里的自然布局
    card.style.display='flex';
    card.style.flexDirection='column';
    card.style.gap='10px';

    const title = document.createElement('div');
    title.textContent = 'Choose your Language';
    title.style.fontWeight='600';
    title.style.fontSize='14px';
    card.appendChild(title);

    const btns = document.createElement('div');
    btns.style.display='grid';
    btns.style.gridTemplateColumns='repeat(2, minmax(0,1fr))';
    btns.style.gap='8px';

    LANGS.forEach(l=>{
      const b=document.createElement('button');
      b.type='button';
      b.textContent = `${l.flag} ${l.label}`;
      b.style.padding='8px 10px';
      b.style.border='1px solid rgba(120,130,200,.25)';
      b.style.background='rgba(255,255,255,.08)';
      b.style.borderRadius='10px';
      b.style.cursor='pointer';
      b.style.fontSize='12px';
      b.style.userSelect='none';
      b.onmouseenter=()=>{ b.style.background='rgba(255,255,255,.15)'; };
      b.onmouseleave=()=>{ b.style.background='rgba(255,255,255,.08)'; };
      b.onclick=()=>{
        // 点击后：关闭卡片 -> 短加载 -> 欢迎词
        try{ cardWrap.remove(); }catch(e){}
        showTyping();
        setTimeout(()=>{
          hideTyping();
          localStorage.setItem(langStorageKey(), l.code);
          greetByLanguage(l.code);
        }, 600);
      };
      btns.appendChild(b);
    });
    card.appendChild(btns);

    const cardWrap = addAgentCard(card);
    return cardWrap;
  }

  // 进入聊天：先短加载，再弹语言选择；若当会话已选过语言，则直接按语言问候
  function startLanguageFlowOnce(){
    const chosen = localStorage.getItem(langStorageKey());
    if(chosen){
      // 已选过，且本会话未结束：直接展示语言问候（避免重复弹窗）
      greetByLanguage(chosen);
      return;
    }
    // 短加载 -> 弹出选择
    showTyping();
    setTimeout(()=>{
      hideTyping();
      showLanguagePicker();
    }, 700);
  }

  function setEnded(v){
    ended=!!v; localStorage.setItem(ENDED_KEY, ended?'1':'0');
    composer.style.display=ended?'none':'flex';
    if(ended){ showToast('ended','Session ended'); showResumePill(); }
  }

  function resetIdle(){
    if(idleTimer) clearTimeout(idleTimer);
    idleTimer=setTimeout(()=>{
      if(!ended){
        ended = true; localStorage.setItem(ENDED_KEY,'1');
        hideTyping();
        fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'end',reason:'auto-inactive-15m'})});
        setEnded(true);
      }
    }, INACTIVE_MS);
  }

  function requireUID(){ composer.style.display='none'; uidModal.style.display='flex'; uidInput.focus(); }

  // UID 校验：必须 8 位数字；错误时提示并不进入
  function unlockWithUID(val){
    uid=(val||'').trim(); 
    if(!/^\d{8}$/.test(uid)){
      invalidUIDFeedback(); 
      showToast('failed','INVALID_UID'); 
      return; 
    }
    localStorage.setItem(UID_KEY, uid);
    uidModal.style.display='none';
    composer.style.display='flex';
    fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'uid',uid})}).then(()=>{
      return fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'continue'})});
    }).then(()=>{
      localStorage.setItem(ENDED_KEY,'0'); 
      setEnded(false); 
      composer.style.display='flex'; 
      showToast('connected','Connected'); 
      loadHistory();
      startLanguageFlowOnce();   // <<<<<< 启动语言流程
      resetIdle();
    });
  }
  // 暴露给 HTML 的 onclick
  window.unlockWithUID = unlockWithUID;

  if(uid){ 
    composer.style.display=ended?'none':'flex';  
    loadHistory(); 
    if(!ended){ startLanguageFlowOnce(); } // <<<<<< 已登录但未结束时，同样流程
    if(ended){ showResumePill(); } 
  } else { 
    requireUID(); 
  }

  uidOk.addEventListener('click',()=>unlockWithUID(uidInput.value));
  uidInput.addEventListener('keydown',(e)=>{ if(e.key==='Enter') unlockWithUID(uidInput.value); });

  const params=new URLSearchParams(location.search); const g=params.get('g')||'';
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = scheme + '://' + location.host + '/ws?sid=' + encodeURIComponent(sid) + (g? '&g=' + encodeURIComponent(g):'');
  const ws = new WebSocket(wsUrl);
  ws.onmessage=(ev)=>{
    try{
      const data=JSON.parse(ev.data);
      if(data.type==='FROM_AGENT_TEXT'){
        hideTyping();
        addMsg(data.text,false);
        if(!REPLAY){ try{ pushHistory({type:'text', text:data.text, me:false}); }catch(e){} }
        resetIdle();
      } else if(data.type==='FROM_AGENT_IMAGE'){
        hideTyping();
        addImage(data.url,data.caption,false);
        if(!REPLAY){ try{ pushHistory({type:'img', url:data.url, caption:data.caption, me:false}); }catch(e){} }
        resetIdle();
      }
    }catch(e){}
  };

  function send(){
    if(ended) return;
    const text=input.value.trim();
    if(!text) return;
    input.value='';
    addMsg(text,true);
    showTyping(); // 显示“正在输入…”
    fetch('/api/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,text})}).catch(()=>{});
    resetIdle();
  }
  sendBtn.onclick=send;
  input.addEventListener('keydown',(e)=>{ if(e.key==='Enter') send(); });

  fileInput.addEventListener('change',()=>{
    const f=fileInput.files[0]; if(!f) return;
    if(f.size>8*1024*1024){ showToast('toolarge','Too large (8MB)'); fileInput.value=''; return; }
    const fd=new FormData(); fd.append('image',f); fd.append('sessionId',sid); fd.append('caption','');
    addImage(URL.createObjectURL(f),'',true);
    showTyping(); // 发送图片也显示“正在输入”
    fetch('/api/send-image',{method:'POST',body:fd}).catch(()=>showToast('failed','Failed')).finally(()=> fileInput.value='');
    resetIdle();
  });

  // 结束对话：防多次点击与重复通知
  btnEnd.addEventListener('click',()=>{
    if(ended) return;                
    ended = true;                    
    localStorage.setItem(ENDED_KEY,'1');
    btnEnd.style.pointerEvents='none';
    hideTyping();
    fetch('/api/status',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({sessionId:sid,action:'end',reason:'manual'})
    }).finally(()=>setEnded(true));
  });

  // 提供给内部使用的 UID 错误反馈
  function invalidUIDFeedback(){
    try{
      uidInput.classList.remove('shake');
      uidInput.classList.add('invalid','shake');
      setTimeout(()=>uidInput.classList.remove('shake'),450);
    }catch(e){}
  }
})();
