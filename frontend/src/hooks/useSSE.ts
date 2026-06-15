import { useEffect, useRef, useCallback } from 'react';

export function useSSE(url: string | null, onMessage: (data: any) => void, deps: any[] = []) {
  const esRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!url) return;
    const token = localStorage.getItem('podium_token');
    const fullUrl = token ? `${url}${url.includes('?') ? '&' : '?'}token=${token}` : url;

    const es = new EventSource(fullUrl);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = e.data === '[DONE]' ? { done: true } : JSON.parse(e.data);
        onMessageRef.current(data);
      } catch {}
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  
  }, [url, ...deps]);

  const close = useCallback(() => {
    esRef.current?.close();
  }, []);

  return { close };
}
