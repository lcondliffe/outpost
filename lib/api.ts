const API_BASE = '';  // Same origin, no need for full URL

async function fetchApi<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

export interface PingResult {
  id: number;
  timestamp: number;
  target: string;
  target_name: string;
  rtt_min: number | null;
  rtt_avg: number | null;
  rtt_max: number | null;
  packet_loss: number;
  success: number;
}

export interface SpeedtestResult {
  id: number;
  timestamp: number;
  download_mbps: number | null;
  upload_mbps: number | null;
  ping_ms: number | null;
  jitter_ms: number | null;
  server_id: string | null;
  server_name: string | null;
  success: number;
  error: string | null;
}

export interface DnsResult {
  id: number;
  timestamp: number;
  server: string;
  server_name: string;
  query_domain: string;
  response_time_ms: number | null;
  success: number;
}

export interface Outage {
  id: number;
  start_time: number;
  end_time: number | null;
  duration_seconds: number | null;
  affected_services: string[];
  notes: string | null;
}

export interface Stats {
  period: string;
  since: number;
  ping: {
    totalChecks: number;
    successfulChecks: number;
    successRate: string;
    avgLatency: string | null;
    minLatency: string | null;
    maxLatency: string | null;
    avgPacketLoss: string | null;
  };
  speedtest: {
    totalTests: number;
    successfulTests: number;
    avgDownload: string | null;
    avgUpload: string | null;
    minDownload: string | null;
    maxDownload: string | null;
  };
  dns: {
    totalQueries: number;
    successfulQueries: number;
    successRate: string;
    avgResponseTime: string | null;
  };
  outages: {
    totalOutages: number;
    totalDowntimeSeconds: number;
    uptimePercent: string;
  };
}

export interface OutageStatus {
  inOutage: boolean;
  activeOutage: {
    id: number;
    startTime: number;
    affectedServices: string[];
    durationSeconds: number;
  } | null;
  consecutivePingFailures: number;
  consecutivePingSuccesses: number;
}

export interface Config {
  monitors: {
    ping: {
      enabled: boolean;
      intervalSeconds: number;
      targets: Array<{ host: string; name: string }>;
      timeout: number;
      packetCount: number;
    };
    speedtest: {
      enabled: boolean;
      intervalHours: number;
      serverId: string | null;
    };
    dns: {
      enabled: boolean;
      intervalSeconds: number;
      servers: Array<{ address: string; name: string }>;
      testDomains: string[];
      timeout: number;
    };
  };
  outageDetection: {
    pingFailuresForOutage: number;
    pingSuccessesForRecovery: number;
  };
  retention: {
    days: number;
  };
  server: {
    port: number;
  };
}

export const api = {
  // Ping
  getPingResults: (start?: number, end?: number, target?: string) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start.toString());
    if (end) params.set('end', end.toString());
    if (target) params.set('target', target);
    return fetchApi<PingResult[]>(`/api/ping?${params}`);
  },
  getLatestPings: () => fetchApi<PingResult[]>('/api/ping/latest'),

  // Speedtest
  getSpeedtestResults: (start?: number, end?: number) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start.toString());
    if (end) params.set('end', end.toString());
    return fetchApi<SpeedtestResult[]>(`/api/speedtest?${params}`);
  },
  getLatestSpeedtest: () => fetchApi<SpeedtestResult>('/api/speedtest/latest'),
  triggerSpeedtest: () =>
    fetch(`/api/speedtest/run`, { method: 'POST' }).then((r) => r.json()),

  // DNS
  getDnsResults: (start?: number, end?: number, server?: string) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start.toString());
    if (end) params.set('end', end.toString());
    if (server) params.set('server', server);
    return fetchApi<DnsResult[]>(`/api/dns?${params}`);
  },
  getLatestDns: () => fetchApi<DnsResult[]>('/api/dns/latest'),

  // Outages
  getOutages: (start?: number, end?: number, status?: string) => {
    const params = new URLSearchParams();
    if (start) params.set('start', start.toString());
    if (end) params.set('end', end.toString());
    if (status) params.set('status', status);
    return fetchApi<Outage[]>(`/api/outages?${params}`);
  },
  getRecentOutages: (limit = 10) =>
    fetchApi<Outage[]>(`/api/outages/recent?limit=${limit}`),

  // Stats
  getStats: (period = '24h') => fetchApi<Stats>(`/api/stats?period=${period}`),

  // Status
  getStatus: () => fetchApi<OutageStatus>('/api/status'),

  // Config
  getConfig: () => fetchApi<{ config: Config; constraints: object }>('/api/config'),
  updateConfig: (config: Partial<Config>) =>
    fetch(`/api/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).then((r) => r.json()),
  resetConfig: () =>
    fetch(`/api/config/reset`, { method: 'POST' }).then((r) => r.json()),

  // Health
  getHealth: () => fetchApi<{ status: string; version: string; uptime: number }>('/api/health'),
};

export function getPeriodMs(period: string): number {
  const periods: Record<string, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  };
  return periods[period] || periods['24h'];
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
