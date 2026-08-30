import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Send, Bot, User, Copy, CheckCircle, Trash2, Edit2, Zap, ChevronRight, Search, Cloud, HardDrive } from 'lucide-react';
import { Card, EmptyState, Skeleton } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useDeployments } from '../hooks/useDeployments';
import { API_BASE_URL } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { timeAgo, copyToClipboard, parseApiError } from '../lib/utils';
import api from '../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  updated_at: string;
}

interface CombinedDeployment {
  id: string;
  name: string;
  status: string;
  source: 'local' | 'cloud';
  provider?: string;
}

const STATUS_DOT: Record<string, string> = {
  running: '#30d158', live: '#30d158', building: '#6366f1', deploying: '#22d3ee',
  failed: '#ff453a', queued: '#ff9f0a', stopped: '#48484a', suspended: '#48484a', pending: '#ff9f0a',
};

// Local Docker deployments + cloud provider deployments (Render/Railway/Vercel/etc.),
// merged so the assistant's deployment picker and Quick Actions can reach both —
// not just what useDeployments() returns.
function useAllDeployments() {
  const { deployments: local } = useDeployments();
  const [cloud, setCloud] = useState<CombinedDeployment[]>([]);

  useEffect(() => {
    api.get('/api/providers/deployments').then(({ data }) => {
      setCloud((data || []).map((d: any) => ({ id: d.id, name: d.name, status: d.status, source: 'cloud' as const, provider: d.provider })));
    }).catch(() => setCloud([]));
  }, []);

  const combined: CombinedDeployment[] = [
    ...local.map(d => ({ id: d.id, name: d.name, status: d.status, source: 'local' as const })),
    ...cloud,
  ];
  return combined;
}

function MarkdownContent({ content }: { content: string }) {
  
  const html = content
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) =>
      `<pre><code class="lang-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  return (
    <div className="prose" dangerouslySetInnerHTML={{ __html: `<p>${html}</p>` }} />
  );
}

function CodeBlock({ content, onCopy }: { content: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    copyToClipboard(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy();
  };
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={handleCopy} style={{
        position: 'absolute', top: 8, right: 8, background: 'var(--bg-hover)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        fontSize: '11px', color: 'var(--text-secondary)',
      }}>
        {copied ? <CheckCircle size={11} color="var(--accent-green)" /> : <Copy size={11} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export default function AIAssistant() {
  const deployments = useAllDeployments();
  const { success, error: showError } = useToast();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [convLoading, setConvLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeDepId, setAnalyzeDepId] = useState('');
  const [depFilter, setDepFilter] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.get('/api/ai/model').then(r => setHasKey(r.data.hasKey)).catch(() => setHasKey(false));
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const { data } = await api.get('/api/ai/conversations');
      setConversations(data);
      setConvLoading(false);
    } catch {}
  };

  const loadConversation = async (id: string) => {
    try {
      const { data } = await api.get(`/api/ai/conversations/${id}`);
      setMessages(data.messages || []);
      setActiveConvId(id);
    } catch {}
  };

  const createConversation = async () => {
    try {
      const { data } = await api.post('/api/ai/conversations');
      setConversations(prev => [data, ...prev]);
      setMessages([]);
      setActiveConvId(data.id);
    } catch (err) { showError(parseApiError(err)); }
  };

  const deleteConversation = async (id: string) => {
    try {
      await api.delete(`/api/ai/conversations/${id}`);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
    } catch (err) { showError(parseApiError(err)); }
  };

  const updateTitle = async (id: string) => {
    if (!titleInput.trim()) return;
    try {
      await api.put(`/api/ai/conversations/${id}/title`, { title: titleInput });
      setConversations(prev => prev.map(c => c.id === id ? { ...c, title: titleInput } : c));
      setEditingTitle(null);
    } catch {}
  };

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;
    if (!activeConvId) { await createConversation(); }

    const convId = activeConvId;
    const userMsg: Message = {
      id: Date.now().toString(), role: 'user', content: input,
      created_at: new Date().toISOString(),
    };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setStreaming(true);
    setStreamingContent('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('podium_token')}`,
        },
        body: JSON.stringify({
          message: input,
          history: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          conversationId: convId,
        }),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { showError(parsed.error); break; }
            if (parsed.content) {
              fullContent += parsed.content;
              setStreamingContent(fullContent);
            }
          } catch {}
        }
      }

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: fullContent, created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setStreamingContent('');
      loadConversations();
    } catch (err) {
      showError(parseApiError(err));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, activeConvId, messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleAnalyze = async () => {
    if (!analyzeDepId) return;
    setAnalyzing(true);
    try {
      const { data } = await api.post('/api/ai/analyze', { deploymentId: analyzeDepId });
      if (!activeConvId) await createConversation();
      const msg: Message = {
        id: Date.now().toString(), role: 'assistant',
        content: data.analysis, created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, msg]);
    } catch (err) { showError(parseApiError(err)); }
    finally { setAnalyzing(false); }
  };

  const filteredDeployments = depFilter
    ? deployments.filter(d => d.name.toLowerCase().includes(depFilter.toLowerCase()))
    : deployments;

  if (hasKey === false) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>AI Assistant</div>
        <Card style={{ maxWidth: 480, borderColor: 'var(--accent-orange)' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Zap size={20} color="var(--accent-orange)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>AI API Key Required</div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>
                To use the AI Assistant, ask your administrator to configure an AI API key for this server, then add it in Settings → AI.
              </p>
              <Button variant="primary" onClick={() => window.location.href = '/settings'}>Go to Settings</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - var(--topbar-height) - var(--titlebar-height) - 48px)', gap: 0, margin: -24, overflow: 'hidden' }}>
      {}
      <div style={{
        width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--border-muted)', flexShrink: 0 }}>
          <Button variant="primary" fullWidth icon={<Plus size={13} />} size="sm" onClick={createConversation}>
            New Chat
          </Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {convLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 4px' }}>
              {[1, 2, 3].map(i => <Skeleton key={i} height={48} />)}
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
              No conversations yet
            </div>
          ) : conversations.map(conv => (
            <div
              key={conv.id}
              style={{
                padding: '8px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: 2,
                background: activeConvId === conv.id ? 'var(--accent-blue-dim)' : 'transparent',
                border: `1px solid ${activeConvId === conv.id ? 'var(--accent-blue)' : 'transparent'}`,
                transition: 'all 120ms',
              }}
              onClick={() => loadConversation(conv.id)}
              onMouseEnter={e => { if (activeConvId !== conv.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (activeConvId !== conv.id) e.currentTarget.style.background = 'transparent'; }}
            >
              {editingTitle === conv.id ? (
                <input
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') updateTitle(conv.id); if (e.key === 'Escape') setEditingTitle(null); }}
                  onBlur={() => updateTitle(conv.id)}
                  autoFocus
                  style={{
                    width: '100%', background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                    border: '1px solid var(--accent-blue)', borderRadius: 4, padding: '2px 6px', fontSize: '12px',
                    fontFamily: 'var(--font-sans)', outline: 'none',
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500, color: activeConvId === conv.id ? 'var(--accent-blue)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.title}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2 }}>
                      {conv.message_count} messages · {timeAgo(conv.updated_at)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 2, flexShrink: 0, opacity: 0 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                  >
                    <button onClick={e => { e.stopPropagation(); setEditingTitle(conv.id); setTitleInput(conv.title); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}>
                      <Edit2 size={11} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', padding: 2, display: 'flex' }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {}
        <div style={{ padding: '14px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Analyze a deployment</div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={12} color="var(--text-muted)" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={depFilter}
              onChange={e => setDepFilter(e.target.value)}
              placeholder="Search deployments…"
              style={{
                width: '100%', padding: '7px 8px 7px 26px',
                background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                fontSize: '12px', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 168, overflowY: 'auto', marginBottom: 10 }}>
            {filteredDeployments.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '6px 2px' }}>No deployments found</div>
            ) : filteredDeployments.map(d => {
              const isSelected = analyzeDepId === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setAnalyzeDepId(d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
                    padding: '6px 8px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: isSelected ? 'var(--accent-blue-dim)' : 'transparent',
                    border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'transparent'}`,
                    fontFamily: 'var(--font-sans)', transition: 'all 120ms',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[d.status] || 'var(--text-muted)', flexShrink: 0 }} />
                  {d.source === 'cloud' ? <Cloud size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} /> : <HardDrive size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />}
                  <span style={{ flex: 1, minWidth: 0, fontSize: '12px', color: isSelected ? 'var(--accent-blue)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', flexShrink: 0 }}>{d.status}</span>
                </button>
              );
            })}
          </div>
          <Button size="sm" fullWidth variant="secondary" onClick={handleAnalyze} loading={analyzing} disabled={!analyzeDepId} icon={<Bot size={12} />}>
            Analyze Deployment
          </Button>
        </div>
      </div>

      {}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeConvId ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={28} color="#fff" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Podium AI</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: 360, lineHeight: 1.6 }}>
                Your AI DevOps assistant. Ask about deployments, analyze logs, troubleshoot issues, or get optimization tips.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 500, width: '100%' }}>
              {[
                'Why is my Railway deployment failing?',
                'How do I set environment variables on Render?',
                'Explain blue-green vs canary deployments',
                'Best practices for CI/CD pipelines',
              ].map(prompt => (
                <button key={prompt} onClick={() => { createConversation().then(() => { setInput(prompt); }); }}
                  style={{
                    padding: '10px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)',
                    textAlign: 'left', transition: 'all 120ms', display: 'flex', alignItems: 'center', gap: 8,
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  <ChevronRight size={12} style={{ flexShrink: 0 }} />{prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {messages.map(msg => (
                <div key={msg.id} style={{
                  display: 'flex', gap: 12, marginBottom: 20,
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Bot size={15} color="#fff" />
                    </div>
                  )}
                  <div style={{
                    maxWidth: '75%',
                    padding: msg.role === 'user' ? '10px 14px' : '14px 16px',
                    borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                    background: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--bg-card)',
                    border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                    fontSize: '13px', lineHeight: 1.6,
                  }}>
                    {msg.role === 'assistant' ? <MarkdownContent content={msg.content} /> : msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                      <User size={14} color="#fff" />
                    </div>
                  )}
                </div>
              ))}

              {}
              {streaming && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bot size={15} color="#fff" />
                  </div>
                  <div style={{
                    maxWidth: '75%', padding: '14px 16px', borderRadius: '4px 14px 14px 14px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.6,
                  }}>
                    {streamingContent ? (
                      <>
                        <MarkdownContent content={streamingContent} />
                        <span style={{ display: 'inline-block', width: 8, height: 14, background: 'var(--accent-blue)', marginLeft: 2, animation: 'blink-cursor 1s infinite', verticalAlign: 'middle' }} />
                      </>
                    ) : (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
                        {[0, 1, 2].map(i => (
                          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-blue)', display: 'block', animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {}
            <div style={{ padding: '12px 24px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-primary)', flexShrink: 0 }}>
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-end',
                background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xl)', padding: '8px 12px',
                transition: 'border-color 150ms',
              }}
                onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder="Ask anything about your infrastructure... (Enter to send, Shift+Enter for newline)"
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'var(--font-sans)',
                    resize: 'none', lineHeight: 1.5, minHeight: 20, maxHeight: 120,
                    padding: '4px 0',
                  }}
                  rows={1}
                  disabled={streaming}
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || streaming}
                  style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: input.trim() && !streaming ? 'var(--accent-blue)' : 'var(--bg-tertiary)',
                    border: 'none', cursor: input.trim() && !streaming ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 150ms',
                  }}
                >
                  <Send size={14} color={input.trim() && !streaming ? '#fff' : 'var(--text-muted)'} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
