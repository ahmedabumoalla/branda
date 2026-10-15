const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

// Exercise the actual component's lifecycle and event handlers without a browser.
function fixture({ reduced = false, saveData = false, rejectPlay = false } = {}) {
  const state = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0, first = true, videoNode, buttonNode;
  const doc = new EventTarget(); doc.hidden = false;
  const motion = new EventTarget(); motion.matches = reduced;
  const connection = new EventTarget(); connection.saveData = saveData;
  const element = {
    src: '', muted: false, paused: true, plays: 0, error: null,
    getAttribute(name) { return name === 'src' ? this.src : null; },
    load() { this.error = null; },
    play() { this.plays++; if (rejectPlay) return Promise.reject(new Error('Autoplay blocked')); this.paused = false; videoNode.props.onPlaying(); return Promise.resolve(); },
    pause() { this.paused = true; videoNode?.props.onPause(); },
  };
  const hooks = {
    ...React,
    useState(initial) { const i=stateIndex++; if(first)state[i]=initial; return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}]; },
    useRef(initial) { const i=refIndex++; if(first)refs[i]={current:initial}; return refs[i]; },
    useEffect(effect) { if(first)effects.push(effect); },
  };
  const compiled = ts.transpileModule(fs.readFileSync('components/menu/deli-menu-scenes.tsx','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop:true } }).outputText;
  const exports = {};
  const req = name => name==='react'?hooks:name==='react/jsx-runtime'?require(name):name.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,key)=>key})}:{};
  new Function('require','exports','window','document','navigator',compiled)(req,exports,{matchMedia:()=>motion},doc,{connection});
  function visit(node) {
    if (!node || typeof node!=='object')return;
    if(node.type==='video'){videoNode=node;node.props.ref.current=element;}
    if(node.type==='button')buttonNode=node;
    React.Children.forEach(node.props?.children,visit);
  }
  function render(){stateIndex=0;refIndex=0;visit(exports.DeliBackground());first=false;}
  render(); const cleanup=effects.map(effect=>effect());render();
  return {
    element, doc, motion, connection,
    render, video:()=>videoNode, button:()=>buttonNode,
    click(){render();buttonNode.props.onClick();render();},
    ended(){videoNode.props.onEnded();render();},
    visibility(hidden){doc.hidden=hidden;doc.dispatchEvent(new Event('visibilitychange'));render();},
    preference(target,value){target.matches=value;target.dispatchEvent(new Event('change'));render();},
    cleanup(){cleanup.forEach(fn=>fn?.());},
  };
}

(async()=>{
  const normal=fixture();assert(normal.element.src.endsWith('background-01.mp4'));assert(normal.element.muted&&!normal.element.paused);
  normal.ended();assert(normal.element.src.endsWith('background-02.mp4'));
  normal.ended();assert(normal.element.src.endsWith('background-03.mp4'));
  normal.ended();assert(normal.element.src.endsWith('background-01.mp4'));
  normal.visibility(true);assert(normal.element.paused);normal.visibility(false);assert(!normal.element.paused);
  normal.click();assert(normal.element.paused);normal.visibility(true);normal.visibility(false);assert(normal.element.paused,'Manual pause survives hidden/visible transitions');
  normal.preference(normal.motion,true);normal.preference(normal.motion,false);assert(normal.element.paused,'Preference changes preserve explicit pause');
  normal.click();assert(!normal.element.paused);normal.cleanup();const plays=normal.element.plays;
  normal.visibility(false);assert(normal.element.paused&&normal.element.plays===plays,'Unmount removes listeners and pauses playback');
  for(const options of [{reduced:true},{saveData:true}]){
    const limited=fixture(options);assert.equal(limited.element.src,'','No video downloaded under motion/data saving preference');assert(limited.element.paused);
    limited.click();assert(!limited.element.paused&&limited.element.src.endsWith('background-01.mp4'),'Explicit play remains available');limited.cleanup();
  }
  const blocked=fixture({rejectPlay:true});await Promise.resolve();blocked.render();
  assert.equal(blocked.video().props['data-failed'],true);assert(blocked.button().props['aria-label'].includes('تشغيل'));
  blocked.cleanup();
  console.log('PASS Deli video: three-film cycle, muted playback, pause/resume, hidden tabs, reduced motion, data saving, manual choice, blocked fallback and cleanup');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
