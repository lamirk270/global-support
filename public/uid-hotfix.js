
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
