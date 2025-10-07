
// uid-hotfix.js — v8.9h
(function(){
  function toast(txt){
    try{
      const t=document.getElementById('toast');
      if(!t){ alert(txt); return; }
      t.textContent=txt; t.classList.add('show');
      setTimeout(()=>t.classList.remove('show'),1500);
    }catch(e){ try{ alert(txt); }catch(_){ } }
  }
  function newSid(){ return (Date.now().toString(36)+Math.random().toString(36).slice(2,8)); }

  // Global, so inline onclick can always find it
  window.unlockWithUID = function(val){
    try{
      var inp = document.getElementById('uidInput');
      val = (val||'').trim();
      window.__lastUID = val;

      // Validate: 8 digits
      if(!/^\d{8}$/.test(val)){
        if(inp){
          inp.classList.add('invalid');
          inp.classList.add('shake');
          setTimeout(()=>{ try{ inp.classList.remove('shake'); }catch(_){ } }, 450);
        }
        toast('INVALID_UID');
        return;
      }

      // Valid path
      var uid = val;
      // Persist uid
      try{ localStorage.setItem('hs_uid', uid); }catch(_){}

      // Compute per-uid sid key (matches v8.4a logic)
      var sidKey = 'hs_sid_' + uid;
      var sid = null;
      try{ sid = localStorage.getItem(sidKey); }catch(_){ sid = null; }
      if(!sid){ sid = newSid(); try{ localStorage.setItem(sidKey, sid);}catch(_){} }
      // Also set ended=0
      try{ localStorage.setItem('hs_ended','0'); }catch(_){}

      // UI: hide modal, show composer
      var modal = document.getElementById('uidModal');
      var comp = document.getElementById('composer');
      if(modal) modal.style.display='none';
      if(comp) comp.style.display='flex';

      // Call existing helpers if present
      try{ if(typeof setEnded==='function') setEnded(false); }catch(_){}
      try{ if(typeof resetIdle==='function') resetIdle(); }catch(_){}

      // Load history for this (resumeToken+uid) bucket if available
      try{
        if(typeof loadHistoryOnce==='function') loadHistoryOnce();
        else if(typeof loadHistory==='function') loadHistory();
      }catch(_){}

      // Inform server (best-effort)
      try{
        if(typeof fetch==='function'){
          fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'uid',uid})})
          .then(()=>fetch('/api/status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,action:'continue'})}))
          .catch(()=>{});
        }
      }catch(_){}

      // Connected toast
      try{ if(typeof showToast==='function') showToast('connected','Connected'); }catch(_){}
    }catch(e){
      console.error('unlock fatal', e);
      try{ alert('Unlock fatal: '+(e && e.message || e)); }catch(_){}
    }
  };

  // Dom fallback binding (in case inline is stripped by CSP)
  function bind(){
    var btn = document.getElementById('uidOk');
    var inp = document.getElementById('uidInput');
    if(btn && !btn.__hfix){
      btn.__hfix=true;
      btn.addEventListener('click', ()=> window.unlockWithUID && window.unlockWithUID(inp && inp.value));
    }
    if(inp && !inp.__hfix){
      inp.__hfix=true;
      inp.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ window.unlockWithUID && window.unlockWithUID(inp.value); } });
      inp.addEventListener('input', ()=> inp.classList.remove('invalid'));
    }
  }
  if(document.readyState!=='loading') bind();
  else document.addEventListener('DOMContentLoaded', bind);

  // Delegate-click safety net
  document.addEventListener('click', function(ev){
    var t = ev.target;
    if(t && t.id==='uidOk'){ window.unlockWithUID && window.unlockWithUID((document.getElementById('uidInput')||{}).value); }
  }, true);
})();

// --- v8.9h hotfix extension: send fallback + auto greeting ---
(function(){
  var GREET_KEY = 'hs_greeted_once_v89h';
  var SID_KEY = 'hs_sid';
  function qs(id){ return document.getElementById(id); }
  function val(el){ return (el && typeof el.value==='string') ? el.value : ''; }
  function safeText(s){ return (s==null?'':String(s)).trim(); }

  function appendAgentHelloOnce(){
    try{
      if(localStorage.getItem(GREET_KEY)==='1') return;
      var msgs = qs('msgs');
      if(!msgs) return;
      // Only greet if chat view is visible and empty-ish
      var comp = qs('composer');
      var visible = comp && getComputedStyle(comp).display!=='none';
      if(!visible) return;
      // Avoid double-greet if messages already exist
      if(msgs.children && msgs.children.length>0) { localStorage.setItem(GREET_KEY,'1'); return; }

      var wrap = document.createElement('div');
      wrap.className = 'msg'; // agent style (no "me")
      var av = document.createElement('img');
      av.className = 'avatar';
      av.src = '/agent.png'; // keep original asset path
      wrap.appendChild(av);
      var span = document.createElement('div');
      span.textContent = 'Hello';
      wrap.appendChild(span);
      msgs.appendChild(wrap);
      msgs.scrollTop = msgs.scrollHeight;
      localStorage.setItem(GREET_KEY,'1');
    }catch(e){ /* silent */ }
  }

  function sendFallback(){
    var input = qs('input');
    var btn = qs('send');
    var msgs = qs('msgs');
    var composer = qs('composer');
    if(!input || !btn || !msgs || !composer) return;

    function addUserBubble(text){
      var wrap = document.createElement('div');
      wrap.className = 'msg me';
      var span = document.createElement('div');
      span.textContent = text;
      wrap.appendChild(span);
      msgs.appendChild(wrap);
      msgs.scrollTop = msgs.scrollHeight;
    }
    function addAgentBubble(text){
      var wrap = document.createElement('div');
      wrap.className = 'msg';
      var av = document.createElement('img'); av.className='avatar'; av.src='/agent.png'; wrap.appendChild(av);
      var span = document.createElement('div'); span.textContent=text; wrap.appendChild(span);
      msgs.appendChild(wrap);
      msgs.scrollTop = msgs.scrollHeight;
    }

    // Keydown: Enter to send (Shift+Enter = newline)
    if(!input.__hfix_enter){
      input.addEventListener('keydown', function(e){
        if(e.key==='Enter' && !e.shiftKey){
          e.preventDefault();
          (qs('send')||{}).click && qs('send').click();
        }
      });
      input.__hfix_enter = true;
    }

    // If original onclick missing, add a safe fallback that posts to /api/send
    if(!btn.__hfix_bound && !btn.onclick){
      btn.addEventListener('click', function(){
        var text = safeText(val(input));
        if(!text) return;
        input.value = '';
        addUserBubble(text);
        // POST to backend; rely on server websocket to echo agent reply,
        // but also try to render reply if returned directly.
        var sid = (localStorage.getItem(SID_KEY)||'').trim();
        try{
          fetch('/api/send', {
            method:'POST',
            headers:{'content-type':'application/json'},
            body: JSON.stringify({ sessionId: sid, text: text })
          }).then(function(r){ return r.json().catch(function(){return null;}); })
            .then(function(res){
              if(res && res.reply){ addAgentBubble(String(res.reply)); }
            }).catch(function(){});
        }catch(e){ /* ignore */ }
      }, true); // capture to run even if bubbling handlers fail
      btn.__hfix_bound = true;
    }
  }

  // After unlocking with UID (called by inline onclick in HTML), ensure bindings and greeting
  var _origUnlock = window.unlockWithUID;
  window.unlockWithUID = function(v){
    try{
      localStorage.removeItem(GREET_KEY);
    }catch(e){}
    if(typeof _origUnlock === 'function'){
      _origUnlock(v);
      // Defer to allow app.js to toggle views
      setTimeout(function(){
        sendFallback();
        appendAgentHelloOnce();
      }, 60);
    }
  };

  // Also try on DOM ready (in case UID is already present in storage)
  function ready(){
    setTimeout(function(){
      sendFallback();
      appendAgentHelloOnce();
    }, 120);
  }
  if(document.readyState!=='loading') ready();
  else document.addEventListener('DOMContentLoaded', ready);

})();
// --- end hotfix extension ---
