import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export interface Deployment {
  id: string;
  name: string;
  repo_url?: string;
  branch: string;
  status: 'running' | 'building' | 'stopped' | 'failed' | 'pending';
  container_id?: string;
  image?: string;
  ports: Array<{ host: string; container: string }>;
  env_vars: Array<{ key: string; value: string }>;
  dockerfile_path: string;
  memory_limit: string;
  cpu_limit: string;
  restart_policy: string;
  replicas: number;
  commit_sha?: string;
  commit_message?: string;
  domain?: string;
  auto_deploy: number;
  created_at: string;
  updated_at: string;
}

export function useDeployments(pollInterval = 0) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const { data } = await api.get('/api/deployments');
      setDeployments(data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    if (pollInterval > 0) {
      const id = setInterval(fetch, pollInterval);
      return () => clearInterval(id);
    }
  }, [fetch, pollInterval]);

  return { deployments, loading, error, refetch: fetch, setDeployments };
}
