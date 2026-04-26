/* ElevenLabs TTS shim — overrides window.speechSynthesis so every existing
   speak() call across the app routes through /api/elevenlabs with the
   configured Nigerian voice. Drop-in: no per-page changes required. */
(function(){
  if (window.__ELEVEN_TTS_INSTALLED__) return;
  window.__ELEVEN_TTS_INSTALLED__ = true;

  var ENDPOINT = '/api/elevenlabs';
  var VOICE_ID = 'CiGXiF6vr3ULNlgVfZ5z'; // Nigerian voice
  window.ELEVEN_VOICE_ID = VOICE_ID;

  var currentAudio = null;
  var currentCtl   = null;
  var cache = new Map(); // text -> objectURL

  function stop(){
    try { if (currentCtl) currentCtl.abort(); } catch(e){}
    currentCtl = null;
    if (currentAudio){
      try { currentAudio.pause(); } catch(e){}
      currentAudio.src = '';
      currentAudio = null;
    }
    try { _origCancel && _origCancel.call(window.speechSynthesis); } catch(e){}
  }

  async function fetchAudio(text){
    if (cache.has(text)) return cache.get(text);
    currentCtl = new AbortController();
    var resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text, voiceId: VOICE_ID }),
      signal: currentCtl.signal
    });
    if (!resp.ok) throw new Error('TTS ' + resp.status);
    var blob = await resp.blob();
    var url  = URL.createObjectURL(blob);
    if (cache.size > 50) { // bound cache
      var firstKey = cache.keys().next().value;
      try { URL.revokeObjectURL(cache.get(firstKey)); } catch(e){}
      cache.delete(firstKey);
    }
    cache.set(text, url);
    return url;
  }

  async function play(text, onend){
    stop();
    try {
      var url = await fetchAudio(text);
      var a = new Audio(url);
      currentAudio = a;
      a.onended = function(){ if (typeof onend === 'function') try{ onend(); }catch(e){} };
      a.onerror = function(){ if (typeof onend === 'function') try{ onend(); }catch(e){} };
      await a.play();
    } catch (e) {
      console.warn('[ElevenLabs] falling back to browser TTS:', e);
      try {
        var u = new _OrigUtter(text);
        _origSpeak.call(window.speechSynthesis, u);
      } catch(_) {}
      if (typeof onend === 'function') try{ onend(); }catch(e){}
    }
  }

  // Preserve originals before overriding
  var _origSpeak  = window.speechSynthesis && window.speechSynthesis.speak;
  var _origCancel = window.speechSynthesis && window.speechSynthesis.cancel;
  var _OrigUtter  = window.SpeechSynthesisUtterance;

  // Override SpeechSynthesisUtterance to be a plain text holder
  function ShimUtter(text){
    this.text = text || '';
    this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null;
    this.onend = null; this.onerror = null; this.onstart = null;
  }
  window.SpeechSynthesisUtterance = ShimUtter;

  // Override speechSynthesis methods
  if (window.speechSynthesis){
    window.speechSynthesis.speak = function(utter){
      var t = (utter && utter.text) || '';
      if (!t) return;
      var cb = utter && utter.onend;
      if (typeof utter.onstart === 'function') { try{ utter.onstart(); }catch(e){} }
      play(t, cb);
    };
    window.speechSynthesis.cancel = function(){ stop(); };
    // getVoices returns empty — voice is fixed server-side
    window.speechSynthesis.getVoices = function(){ return []; };
  }

  // Public helper
  window.elevenSpeak = function(text, onend){ play(String(text||''), onend); };
  window.elevenStop  = stop;
})();

