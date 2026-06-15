import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, RotateCcw, ExternalLink, Settings, CheckCircle, XCircle, ChevronDown } from 'lucide-react';
import { Card, Badge, EmptyState, SectionHeader, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal, Input, Select, ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../contexts/ToastContext';
import { useRole } from '../hooks/useRole';
import { ViewerBanner } from '../components/ui/ViewerBanner';
import { timeAgo, parseApiError } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface Provider { id: string; label: string; icon: string; configured: boolean; regions: string[]; hint: string; }
interface CloudDep  { id: string; provider: string; name: string; region: string; status: string; url?: string; config: Record<string,string>; logs: Array<{time:string;message:string}>; created_at: string; updated_at: string; }

// ── Provider status card ───────────────────────────────────────────────────────
function ProviderCard({ p, onDeploy }: { p: Provider; onDeploy: (id: string) => void }) {
  const navigate   = useNavigate();
  const { canDeploy } = { canDeploy: useRole().can.cloudDeploy };

  return (
    <Card hoverable style={{ transition: 'all 200ms' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 'var(--r-lg)', flexShrink: 0,
          background: p.configured ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
          border: `1px solid ${p.configured ? 'rgba(16,185,129,.3)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, transition: 'all 200ms',
        }}>
          {p.icon}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.label}</span>
            {p.configured
              ? <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:'11px', color:'var(--accent-green)', fontWeight:600 }}><CheckCircle size={11}/>Connected</span>
              : <span style={{ display:'flex', alignItems:'center', gap:4, fontSize:'11px', color:'var(--text-muted)', fontWeight:500 }}><XCircle size={11}/>Demo mode</span>
            }
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {p.configured ? p.hint : `${p.hint} — add credentials to deploy for real`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {!p.configured && (
            <Button size="sm" variant="ghost" icon={<Settings size={12} />}
              onClick={() => navigate('/settings?tab=cloud')}>Configure</Button>
          )}
          {canDeploy && (
            <Button size="sm" variant="primary" icon={<Plus size={12} />}
              onClick={() => onDeploy(p.id)}>
              {p.configured ? 'Deploy' : 'Try Demo'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── New deployment modal ────────────────────────────────────────────────────────
const SOURCE_TYPES = {
  docker:  { label: '🐳 Docker Image', hint: 'Pull a public image from Docker Hub' },
  github:  { label: '🐙 GitHub Repo',  hint: 'Deploy from a public GitHub repository URL' },
  local:   { label: '📁 Local Files',  hint: 'Upload a folder or zip from your machine' },
};

const PROVIDER_SOURCES: Record<string, Array<keyof typeof SOURCE_TYPES>> = {
  azure:  ['docker', 'github'],
  aws:    ['docker', 'github'],
  vercel: ['github', 'local'],
  render: ['docker', 'github'],
  podium: ['docker', 'github'],
};

function DeployModal({ open, onClose, onCreated, defaultProvider, providers }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  defaultProvider?: string; providers: Provider[];
}) {
  const { success, error: showError } = useToast();
  const [loading,  setLoading]  = useState(false);
  const [envRows,  setEnvRows]  = useState<Array<{k:string;v:string}>>([]);
  const [localFiles, setLocalFiles] = useState<FileList | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    provider:     defaultProvider || 'azure',
    name:         '',
    region:       '',
    source_type:  'docker' as keyof typeof SOURCE_TYPES,
    docker_image: '',
    ports:        '80',
    github_repo:  '',
    branch:       'main',
    // Azure-specific
    resource_group: 'podium-rg',
    // AWS-specific
    cpu:    '256',
    memory: '512',
    // Vercel-specific
    framework: '',
    // Render-specific
    plan: 'free',
  });

  const up = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const sel         = providers.find(p => p.id === form.provider);
  const regions     = sel?.regions || [];
  const validSources = PROVIDER_SOURCES[form.provider] || ['docker'];

  useEffect(() => {
    if (regions.length) up('region', regions[0]);
    const defaultSrc = (PROVIDER_SOURCES[form.provider] || ['docker'])[0];
    up('source_type', defaultSrc);
    setLocalFiles(null);
  }, [form.provider]);

  useEffect(() => {
    if (defaultProvider) up('provider', defaultProvider);
  }, [defaultProvider, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) { showError('App name is required'); return; }
    if (form.source_type === 'docker' && !form.docker_image.trim()) { showError('Docker image is required'); return; }
    if (form.source_type === 'github' && !form.github_repo.trim()) { showError('GitHub repo URL is required'); return; }
    setLoading(true);
    try {
      const config = Object.fromEntries(envRows.filter(r => r.k).map(r => [r.k, r.v]));
      const ports  = form.ports.split(',').map(s => s.trim()).filter(Boolean);

      if (form.source_type === 'local' && localFiles) {
        // Send files as FormData
        const fd = new FormData();
        fd.append('data', JSON.stringify({ ...form, config, ports }));
        for (let i = 0; i < localFiles.length; i++) fd.append('files', localFiles[i]);
        await api.post('/api/cloud/deploy', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/api/cloud/deploy', { ...form, config, ports });
      }

      success(`Deploying "${form.name}" to ${sel?.label || form.provider}...`);
      onCreated(); onClose();
    } catch (err) { showError(parseApiError(err)); }
    finally { setLoading(false); }
  };

  // ── Provider-specific extra fields ──────────────────────────────────────────
  const ExtraFields = () => {
    if (form.provider === 'azure') return (
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Input label="Resource Group" value={form.resource_group} onChange={e=>up('resource_group',e.target.value)} placeholder="podium-rg" hint="Auto-created if it doesn't exist" />
        <Select label="CPU / Memory" value={form.cpu} onChange={e=>up('cpu',e.target.value)}
          options={[{value:'0.5',label:'0.5 vCPU / 0.5 GB'},{value:'1',label:'1 vCPU / 1.5 GB'},{value:'2',label:'2 vCPU / 3.5 GB'}]} />
      </div>
    );
    if (form.provider === 'aws') return (
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Select label="CPU" value={form.cpu} onChange={e=>up('cpu',e.target.value)}
          options={[{value:'256',label:'0.25 vCPU'},{value:'512',label:'0.5 vCPU'},{value:'1024',label:'1 vCPU'},{value:'2048',label:'2 vCPU'}]} />
        <Select label="Memory" value={form.memory} onChange={e=>up('memory',e.target.value)}
          options={[{value:'512',label:'512 MB'},{value:'1024',label:'1 GB'},{value:'2048',label:'2 GB'},{value:'4096',label:'4 GB'}]} />
      </div>
    );
    if (form.provider === 'vercel') return (
      <Select label="Framework" value={form.framework} onChange={e=>up('framework',e.target.value)}
        options={[
          {value:'',label:'Auto-detect'},
          {value:'nextjs',label:'Next.js'},
          {value:'create-react-app',label:'React (CRA)'},
          {value:'vite',label:'Vite'},
          {value:'nuxtjs',label:'Nuxt.js'},
          {value:'svelte',label:'SvelteKit'},
          {value:'astro',label:'Astro'},
          {value:'static',label:'Static HTML'},
        ]} />
    );
    if (form.provider === 'render') return (
      <Select label="Plan" value={form.plan} onChange={e=>up('plan',e.target.value)}
        options={[{value:'free',label:'Free (750 hrs/mo, spins down)'},{value:'starter',label:'Starter ($7/mo, always on)'}]} />
    );
    if (form.provider === 'podium') return (
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        <div style={{padding:'10px 14px', borderRadius:'var(--r-md)', background:'var(--accent-green-dim)', border:'1px solid #22c55e44', fontSize:'12px', color:'#22c55e', lineHeight:1.6}}>
          <strong>Self-Hosted</strong> — runs directly on this machine via Docker. Each app gets its own port (3100+).
          Configure Cloudflare Tunnel in <strong>Settings → Self-Hosted</strong> to get a public HTTPS URL.
        </div>
        <Input label="Container Port" value={form.ports} onChange={e=>up('ports',e.target.value)} placeholder="80" hint="The port your app listens on inside the container" />
      </div>
    );
    return null;
  };

  // ── Source input based on type ───────────────────────────────────────────────
  const SourceInput = () => {
    if (form.source_type === 'docker') return (
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Input label="Docker Image" value={form.docker_image} onChange={e=>up('docker_image',e.target.value)}
          placeholder="nginx:latest" style={{gridColumn:'span 2'} as any}
          hint="Any public Docker Hub image e.g. nginx:latest, node:20-alpine, redis:7" />
        <Input label="Exposed Ports" value={form.ports} onChange={e=>up('ports',e.target.value)}
          placeholder="80" hint="Comma-separated" />
      </div>
    );
    if (form.source_type === 'github') return (
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
        <Input label="GitHub Repo URL" value={form.github_repo} onChange={e=>up('github_repo',e.target.value)}
          placeholder="https://github.com/owner/repo" style={{gridColumn:'span 2'} as any}
          hint="Public repo — paste the full URL from your browser" />
        <Input label="Branch" value={form.branch} onChange={e=>up('branch',e.target.value)} placeholder="main" />
        <Input label="Exposed Ports" value={form.ports} onChange={e=>up('ports',e.target.value)} placeholder="3000" hint="Comma-separated" />
      </div>
    );
    if (form.source_type === 'local') return (
      <div style={{display:'flex', flexDirection:'column', gap:10}}>
        <div style={{fontSize:'12px', fontWeight:600, color:'var(--text-secondary)'}}>LOCAL FILES</div>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${localFiles ? 'var(--accent-green)' : 'var(--border)'}`,
            borderRadius: 'var(--r-lg)', padding: '24px 16px', textAlign: 'center',
            cursor: 'pointer', transition: 'all 150ms',
            background: localFiles ? 'var(--accent-green-dim)' : 'var(--bg-elevated)',
          }}
        >
          <div style={{fontSize:28, marginBottom:8}}>{localFiles ? '✅' : '📁'}</div>
          <div style={{fontSize:'13px', fontWeight:600, color:'var(--text-primary)', marginBottom:4}}>
            {localFiles ? `${localFiles.length} file${localFiles.length!==1?'s':''} selected` : 'Click to select files or folder'}
          </div>
          <div style={{fontSize:'11px', color:'var(--text-muted)'}}>
            {localFiles ? Array.from(localFiles).map(f=>f.name).slice(0,3).join(', ') + (localFiles.length>3?'...':'') : 'Select individual files or an entire project folder'}
          </div>
        </div>
        <input ref={fileRef} type="file" multiple style={{display:'none'}}
          onChange={e => setLocalFiles(e.target.files)} />
        <Input label="Exposed Ports" value={form.ports} onChange={e=>up('ports',e.target.value)} placeholder="3000" hint="Comma-separated" />
      </div>
    );
    return null;
  };

  return (
    <Modal open={open} onClose={onClose} title="New Cloud Deployment" width={580}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={loading} onClick={handleSubmit} icon={<Plus size={13}/>}>{sel?.configured ? 'Deploy Now' : 'Start Demo'}</Button></>}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

        {/* Provider selector */}
        <div>
          <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', marginBottom:8 }}>PROVIDER</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
            {providers.map(p => (
              <button key={p.id} onClick={() => up('provider', p.id)} style={{
                padding:'12px 8px', borderRadius:'var(--r-lg)', cursor:'pointer',
                background: form.provider===p.id ? 'var(--accent-blue-dim)' : 'var(--bg-elevated)',
                border:`2px solid ${form.provider===p.id ? 'var(--accent-blue)' : 'var(--border)'}`,
                display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                transition:'all 150ms', fontFamily:'var(--font-sans)',
                boxShadow: form.provider===p.id ? 'var(--glow-blue)' : 'none',
              }}>
                <span style={{fontSize:20}}>{p.icon}</span>
                <span style={{fontSize:'11px', fontWeight:700, color: form.provider===p.id ? 'var(--accent-blue-2)' : 'var(--text-primary)'}}>{p.label}</span>
                <span style={{fontSize:'10px', color: p.configured ? 'var(--accent-green)' : 'var(--text-muted)'}}>
                  {p.configured ? '● Live' : '○ Demo'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Demo notice */}
        {sel && !sel.configured && (
          <div style={{ padding:'10px 14px', borderRadius:'var(--r-md)', background:'var(--accent-blue-dim)', border:'1px solid var(--border-glow)', fontSize:'12px', color:'var(--text-secondary)', lineHeight:1.6 }}>
            <strong style={{color:'var(--accent-blue-2)'}}>Demo mode</strong> — deployment will be simulated with realistic logs.
            Add <strong>{sel.label}</strong> credentials in <strong>Settings → Cloud</strong> to deploy for real.
          </div>
        )}

        {/* App name + region */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
          <Input label="App Name" value={form.name} onChange={e=>up('name',e.target.value)} placeholder="my-app" required />
          <Select label="Region" value={form.region} onChange={e=>up('region',e.target.value)}
            options={regions.map(r=>({value:r,label:r}))} />
        </div>

        {/* Source type toggle */}
        <div>
          <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', marginBottom:8 }}>SOURCE</div>
          <div style={{ display:'flex', gap:8 }}>
            {validSources.map(s => (
              <button key={s} onClick={() => up('source_type', s)} style={{
                flex:1, padding:'10px 8px', borderRadius:'var(--r-md)', cursor:'pointer',
                background: form.source_type===s ? 'var(--accent-blue-dim)' : 'var(--bg-elevated)',
                border:`1.5px solid ${form.source_type===s ? 'var(--accent-blue)' : 'var(--border)'}`,
                display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                transition:'all 150ms', fontFamily:'var(--font-sans)',
              }}>
                <span style={{fontSize:'15px'}}>{SOURCE_TYPES[s].label.split(' ')[0]}</span>
                <span style={{fontSize:'11px', fontWeight:600, color: form.source_type===s ? 'var(--accent-blue-2)' : 'var(--text-primary)'}}>
                  {SOURCE_TYPES[s].label.split(' ').slice(1).join(' ')}
                </span>
                <span style={{fontSize:'10px', color:'var(--text-muted)', textAlign:'center'}}>{SOURCE_TYPES[s].hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Source-specific fields */}
        <SourceInput />

        {/* Provider-specific fields */}
        <ExtraFields />

        {/* Env vars */}
        <div>
          <div style={{fontSize:'12px', fontWeight:600, color:'var(--text-secondary)', marginBottom:8}}>ENVIRONMENT VARIABLES</div>
          {envRows.map((row,i)=>(
            <div key={i} style={{display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8, marginBottom:8}}>
              <Input placeholder="KEY" value={row.k} onChange={e=>{const a=[...envRows];a[i]={...a[i],k:e.target.value};setEnvRows(a);}} style={{fontFamily:'var(--font-mono)',fontSize:'12px'}}/>
              <Input placeholder="value" value={row.v} onChange={e=>{const a=[...envRows];a[i]={...a[i],v:e.target.value};setEnvRows(a);}}/>
              <Button size="sm" variant="ghost" onClick={()=>setEnvRows(rows=>rows.filter((_,j)=>j!==i))}>✕</Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={()=>setEnvRows(r=>[...r,{k:'',v:''}])}>+ Add Variable</Button>
        </div>

      </div>
    </Modal>
  );
}

// ── Deployment card ─────────────────────────────────────────────────────────────
function DepCard({ dep, providers, onAction }: { dep: CloudDep; providers: Provider[]; onAction: () => void }) {
  const { success, error: showError } = useToast();
  const { can } = useRole();
  const [showLogs, setShowLogs] = useState(false);
  const [del, setDel] = useState(false);
  const pMeta = providers.find(p => p.id === dep.provider?.toLowerCase()) || { icon: '☁️', label: dep.provider };
  const isDemo = dep.logs?.[dep.logs.length-1]?.message?.includes('[Demo]') || dep.url?.includes('demo.podium.app');

  const handleDelete = async () => {
    try { await api.delete(`/api/cloud/${dep.id}`); success('Deleted'); onAction(); }
    catch(err) { showError(parseApiError(err)); }
  };
  const handleRedeploy = async () => {
    try { await api.post(`/api/cloud/${dep.id}/redeploy`); success('Redeployment started'); onAction(); }
    catch(err) { showError(parseApiError(err)); }
  };

  return (
    <Card className="dep-card">
      <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12}}>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:5, flexWrap:'wrap'}}>
            <span style={{fontSize:16}}>{(pMeta as any).icon}</span>
            <span style={{fontSize:'14px', fontWeight:700, color:'var(--text-primary)'}}>{dep.name}</span>
            <Badge variant="status" value={dep.status}>{dep.status}</Badge>
            <span style={{fontSize:'10px', fontWeight:700, padding:'1px 7px', borderRadius:'var(--r-pill)',
              background:'var(--accent-blue-dim)', color:'var(--accent-blue-2)', textTransform:'uppercase', letterSpacing:'.06em'}}>
              {(pMeta as any).label || dep.provider}
            </span>
            {isDemo && <span style={{fontSize:'10px', color:'var(--text-muted)', fontStyle:'italic'}}>demo</span>}
          </div>
          <div style={{fontSize:'12px', color:'var(--text-secondary)', marginBottom:3}}>
            Region: <code style={{fontFamily:'var(--font-mono)'}}>{dep.region}</code>
          </div>
          {dep.url && (
            <a href={dep.url} target="_blank" rel="noopener noreferrer"
              style={{fontSize:'12px', color:'var(--accent-blue-2)', display:'inline-flex', alignItems:'center', gap:4}}>
              <ExternalLink size={11}/>{dep.url}
            </a>
          )}
          <div style={{fontSize:'11px', color:'var(--text-muted)', marginTop:4}}>Updated {timeAgo(dep.updated_at)}</div>
        </div>
        <div style={{display:'flex', gap:6, flexShrink:0}}>
          <Button size="sm" variant="ghost" onClick={()=>setShowLogs(l=>!l)}>
            {showLogs?'Hide Logs':'Logs'} {dep.logs.length>0&&`(${dep.logs.length})`}
          </Button>
          {can.cloudDeploy && <Button size="sm" variant="secondary" icon={<RotateCcw size={11}/>} onClick={handleRedeploy}>Redeploy</Button>}
          {can.deleteCloud  && <Button size="sm" variant="danger"    icon={<Trash2 size={11}/>}    onClick={()=>setDel(true)} />}
        </div>
      </div>

      {showLogs && (
        <div style={{marginTop:12, background:'var(--bg-primary)', borderRadius:'var(--r-md)', padding:'10px 14px', maxHeight:220, overflowY:'auto', border:'1px solid var(--border-muted)', animation:'float-up 200ms ease-out'}}>
          {dep.logs.length===0
            ? <div style={{fontSize:'12px', color:'var(--text-muted)', fontFamily:'var(--font-mono)'}}>No logs yet...</div>
            : dep.logs.map((l,i)=>(
              <div key={i} style={{fontFamily:'var(--font-mono)', fontSize:'11px', padding:'2px 0', display:'flex', gap:10, borderBottom:'1px solid var(--border-muted)'}}>
                <span style={{color:'var(--text-muted)', flexShrink:0}}>{new Date(l.time).toLocaleTimeString()}</span>
                <span style={{color: l.message.includes('✗') ? 'var(--accent-red)' : l.message.includes('✓') ? 'var(--accent-green)' : 'var(--text-secondary)'}}>{l.message}</span>
              </div>
            ))
          }
        </div>
      )}

      <ConfirmDialog open={del} title="Delete Deployment" message={`Delete "${dep.name}" from ${(pMeta as any).label}?`}
        confirmLabel="Delete" onConfirm={handleDelete} onCancel={()=>setDel(false)} />
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Cloud() {
  const [providers,    setProviders]    = useState<Provider[]>([]);
  const [deployments,  setDeployments]  = useState<CloudDep[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [newOpen,      setNewOpen]      = useState(false);
  const [newProvider,  setNewProvider]  = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const { can } = useRole();

  const fetch = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([api.get('/api/cloud'), api.get('/api/cloud/providers')]);
      setDeployments(d.data);
      setProviders(p.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 6000);
    return () => clearInterval(id);
  }, [fetch]);

  const filtered = activeFilter === 'all' ? deployments : deployments.filter(d => d.provider?.toLowerCase() === activeFilter);
  const configured = providers.filter(p => p.configured).length;

  return (
    <div style={{display:'flex', flexDirection:'column', gap:20}}>
      <ViewerBanner page="Cloud" />
      <SectionHeader title="Cloud Deployments"
        subtitle={configured > 0 ? `${configured} provider${configured!==1?'s':''} connected` : 'Demo mode — add credentials to deploy for real'}
        action={
          <div style={{display:'flex', gap:8}}>
            <Button icon={<RefreshCw size={14}/>} onClick={fetch} size="sm">Refresh</Button>
            {can.cloudDeploy && <Button variant="primary" icon={<Plus size={14}/>} onClick={()=>{setNewProvider('');setNewOpen(true);}}>New Deployment</Button>}
          </div>
        }
      />

      {/* Provider status cards */}
      <div style={{display:'flex', flexDirection:'column', gap:8}}>
        <div style={{fontSize:'11px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.1em'}}>Cloud Providers</div>
        {loading ? [1,2,3].map(i=><Card key={i}><Skeleton height={44}/></Card>)
          : providers.map(p=><ProviderCard key={p.id} p={p} onDeploy={id=>{setNewProvider(id);setNewOpen(true);}}/>)
        }
      </div>

      {/* Deployments */}
      <div style={{display:'flex', flexDirection:'column', gap:12}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10}}>
          <div style={{fontSize:'11px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.1em'}}>
            Deployments ({deployments.length})
          </div>
          {deployments.length > 0 && (
            <div style={{display:'flex', gap:6}}>
              {['all','azure','aws','vercel','render'].map(f=>(
                <button key={f} onClick={()=>setActiveFilter(f)} style={{
                  padding:'3px 12px', borderRadius:'var(--r-pill)', fontSize:'11px', fontWeight:600,
                  background: activeFilter===f ? 'var(--gradient-brand)' : 'var(--bg-card)',
                  color: activeFilter===f ? '#fff' : 'var(--text-secondary)',
                  border:`1px solid ${activeFilter===f ? 'transparent' : 'var(--border)'}`,
                  cursor:'pointer', fontFamily:'var(--font-sans)', textTransform:'capitalize',
                  boxShadow: activeFilter===f ? 'var(--glow-blue)' : 'none',
                }}>{f}</button>
              ))}
            </div>
          )}
        </div>

        {loading ? [1,2].map(i=><Card key={i}><Skeleton height={72}/></Card>)
          : filtered.length===0
            ? <EmptyState icon="☁️" title="No deployments yet"
                description="Deploy your containers to Azure, AWS, Vercel, or Render in seconds. Works in demo mode without credentials."
                action={can.cloudDeploy ? <Button variant="primary" icon={<Plus size={14}/>} onClick={()=>setNewOpen(true)}>Create First Deployment</Button> : undefined}
              />
            : filtered.map(d=><DepCard key={d.id} dep={d} providers={providers} onAction={fetch}/>)
        }
      </div>

      <DeployModal open={newOpen} onClose={()=>setNewOpen(false)} onCreated={fetch} defaultProvider={newProvider} providers={providers}/>
    </div>
  );
}
