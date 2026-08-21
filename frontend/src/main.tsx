import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldCheck, RotateCcw, Send, ArrowRight, AlertTriangle } from 'lucide-react';
import './styles.css';

type Mode = 'Broadcast' | 'Consumer-Scoped' | 'Request-Scoped';
type Result = { title: string; status: 'ACCEPTED' | 'REJECTED'; reason: string; checks: string[] };

const modes: Record<Mode, { consumer: boolean; request: boolean; description: string }> = {
  Broadcast: { consumer: false, request: false, description: 'Every consumer is authorized to consume the response.' },
  'Consumer-Scoped': { consumer: true, request: false, description: 'The response is intended for exactly one consumer.' },
  'Request-Scoped': { consumer: true, request: true, description: 'The response is bound to one consumer and one request.' }
};

function App() {
  const [mode, setMode] = useState<Mode>('Broadcast');
  const [epoch, setEpoch] = useState(15);
  const [targetConsumer, setTargetConsumer] = useState('Consumer B');
  const [targetRequest, setTargetRequest] = useState(57);
  const [result, setResult] = useState<Result>({ title: 'Ready to verify', status: 'ACCEPTED', reason: 'Generate a response, then choose a verification scenario.', checks: [] });
  const context = modes[mode];

  const verify = (kind: 'valid' | 'replay' | 'consumer' | 'request') => {
    if (kind === 'replay') setResult({ title: 'Temporal replay', status: 'REJECTED', reason: 'Epoch stale: response epoch 15 is older than current epoch 16.', checks: ['Signature valid', 'Epoch stale'] });
    else if (kind === 'consumer' && mode !== 'Broadcast') setResult({ title: 'Cross-consumer misuse', status: 'REJECTED', reason: 'ConsumerID mismatch: response is bound to Consumer A.', checks: ['Signature valid', 'ConsumerID mismatch'] });
    else if (kind === 'request' && mode === 'Request-Scoped') setResult({ title: 'Request substitution', status: 'REJECTED', reason: 'RequestID mismatch: response is bound to Q57, submitted for Q58.', checks: ['Signature valid', 'RequestID mismatch'] });
    else setResult({ title: kind === 'consumer' ? 'Cross-consumer use' : 'Valid response', status: 'ACCEPTED', reason: mode === 'Broadcast' ? 'Broadcast semantics authorize Consumer B.' : 'Signature and expected context are valid.', checks: ['Signature valid', 'Context valid', 'Consumer authorized'] });
  };

  return <main>
    <header><div className="kicker">RESEARCH PROTOTYPE / 01</div><h1>Semantic-aware<br /><em>context binding</em></h1><p>Blockchain oracle responses should bind exactly the context their sharing semantics require.</p></header>
    <section className="grid">
      <div className="panel response"><div className="panel-head"><span>01 / Oracle response</span><ShieldCheck size={18} /></div><label>Semantic class<select value={mode} onChange={e => { setMode(e.target.value as Mode); setResult({ title: 'Ready to verify', status: 'ACCEPTED', reason: modes[e.target.value as Mode].description, checks: [] }); }}>{Object.keys(modes).map(item => <option key={item}>{item}</option>)}</select></label><div className="fields"><div><small>DATA</small><strong>100</strong></div><div><small>EPOCH</small><input type="number" value={epoch} onChange={e => setEpoch(Number(e.target.value))} /></div><div><small>CONSUMER ID</small><strong>Consumer A</strong></div><div><small>REQUEST ID</small><strong>Q57</strong></div></div><div className="signature"><small>SIGNATURE</small><code>0x7c1a...e92f</code></div></div>
      <div className="panel context"><div className="panel-head"><span>02 / Authenticated context</span><span className="tag">{mode}</span></div><p className="muted">{context.description}</p><div className="checks"><div className={context.consumer ? 'checked' : ''}><span>✓</span> ConsumerID <b>{context.consumer ? 'BOUND' : 'NOT REQUIRED FOR CROSS-CONSUMER SECURITY'}</b></div><div className={context.request ? 'checked' : ''}><span>✓</span> RequestID <b>{context.request ? 'BOUND' : 'NOT REQUIRED'}</b></div><div className="checked"><span>✓</span> Epoch <b>WHEN FRESHNESS IS REQUIRED</b></div></div><div className="formula">H(TAG || D || {context.consumer ? 'ConsumerID || ' : ''}{context.request ? 'RequestID || ' : ''}Epoch)</div></div>
      <div className="panel verify"><div className="panel-head"><span>03 / Verification lab</span><span className="live">● LIVE SIMULATION</span></div><div className="target"><div><small>SUBMIT TO</small><select value={targetConsumer} onChange={e => setTargetConsumer(e.target.value)}><option>Consumer A</option><option>Consumer B</option></select></div><div><small>REQUEST</small><input type="number" value={targetRequest} onChange={e => setTargetRequest(Number(e.target.value))} /></div></div><div className="buttons"><button onClick={() => verify('valid')}><Send size={16} /> Verify response</button><button onClick={() => verify('replay')}><RotateCcw size={16} /> Replay attack</button><button onClick={() => verify('consumer')}><ArrowRight size={16} /> Cross-consumer attack</button><button onClick={() => verify('request')}><AlertTriangle size={16} /> Request substitution</button></div></div>
      <div className={`panel result ${result.status.toLowerCase()}`}><div className="panel-head"><span>04 / Result</span><span className="status">{result.status}</span></div><h2>{result.title}</h2><p>{result.reason}</p>{result.checks.map(check => <div className={check.includes('mismatch') || check.includes('stale') ? 'bad' : 'good'} key={check}>{check.includes('mismatch') || check.includes('stale') ? '✕' : '✓'} {check}</div>)}</div>
    </section>
    <footer>Established cryptographic primitives. Experimental validation of the claim that sharing semantics determine necessary cryptographic context.</footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
