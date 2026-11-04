'use client';

import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import { api, Config, SpeedtestServer } from '@/lib/api';

function NumberField({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || min)}
        className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
      />
      <span className="text-xs text-gray-500 ml-2">
        {min}-{max} {unit}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [servers, setServers] = useState<SpeedtestServer[] | null>(null);

  useEffect(() => {
    api.getConfig().then((data) => setConfig(data.config));
    api
      .getSpeedtestServers()
      .then((data) => setServers(data.servers))
      .catch(() => setServers([]));
  }, []);

  // Apply a mutation to a deep copy of the config
  const update = (fn: (draft: Config) => void) => {
    if (!config) return;
    const next = structuredClone(config);
    fn(next);
    setConfig(next);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setMessage(null);

    try {
      const result = await api.updateConfig(config);
      if (result.success) {
        setMessage({ type: 'success', text: 'Configuration saved successfully' });
        setConfig(result.config);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    }

    setSaving(false);
  };

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    setSaving(true);

    try {
      const result = await api.resetConfig();
      if (result.success) {
        setConfig(result.config);
        setMessage({ type: 'success', text: 'Configuration reset to defaults' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to reset configuration' });
    }

    setSaving(false);
  };

  if (!config) {
    return <div className="text-gray-500">Loading configuration...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleReset}
            disabled={saving}
            className="px-4 py-2 border border-gray-700 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded ${
            message.type === 'success'
              ? 'bg-green-900/50 border border-green-700 text-green-200'
              : 'bg-red-900/50 border border-red-700 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card title="Ping Monitor">
        <div className="space-y-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.monitors.ping.enabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  monitors: {
                    ...config.monitors,
                    ping: { ...config.monitors.ping, enabled: e.target.checked },
                  },
                })
              }
              className="w-4 h-4 rounded bg-gray-800 border-gray-700"
            />
            <span>Enabled</span>
          </label>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Interval (seconds)
            </label>
            <input
              type="number"
              min={30}
              max={900}
              value={config.monitors.ping.intervalSeconds}
              onChange={(e) =>
                setConfig({
                  ...config,
                  monitors: {
                    ...config.monitors,
                    ping: {
                      ...config.monitors.ping,
                      intervalSeconds: parseInt(e.target.value, 10) || 60,
                    },
                  },
                })
              }
              className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
            />
            <span className="text-xs text-gray-500 ml-2">30-900 seconds</span>
          </div>

          <NumberField
            label="Packet count"
            value={config.monitors.ping.packetCount}
            min={1}
            max={10}
            unit="packets"
            onChange={(v) => update((c) => { c.monitors.ping.packetCount = v; })}
          />

          <NumberField
            label="Timeout (ms)"
            value={config.monitors.ping.timeout}
            min={1000}
            max={30000}
            unit="ms"
            onChange={(v) => update((c) => { c.monitors.ping.timeout = v; })}
          />

          <div>
            <label className="block text-sm text-gray-400 mb-2">Targets</label>
            <div className="space-y-2">
              {config.monitors.ping.targets.map((target, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={target.host}
                    onChange={(e) => {
                      const newTargets = [...config.monitors.ping.targets];
                      newTargets[index] = { ...target, host: e.target.value };
                      setConfig({
                        ...config,
                        monitors: {
                          ...config.monitors,
                          ping: { ...config.monitors.ping, targets: newTargets },
                        },
                      });
                    }}
                    placeholder="IP or hostname"
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
                  />
                  <input
                    type="text"
                    value={target.name}
                    onChange={(e) => {
                      const newTargets = [...config.monitors.ping.targets];
                      newTargets[index] = { ...target, name: e.target.value };
                      setConfig({
                        ...config,
                        monitors: {
                          ...config.monitors,
                          ping: { ...config.monitors.ping, targets: newTargets },
                        },
                      });
                    }}
                    placeholder="Name"
                    className="w-40 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
                  />
                  <button
                    onClick={() => {
                      const newTargets = config.monitors.ping.targets.filter(
                        (_, i) => i !== index
                      );
                      setConfig({
                        ...config,
                        monitors: {
                          ...config.monitors,
                          ping: { ...config.monitors.ping, targets: newTargets },
                        },
                      });
                    }}
                    className="px-3 py-2 text-red-400 hover:bg-red-900/30 rounded"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {config.monitors.ping.targets.length < 10 && (
                <button
                  onClick={() => {
                    setConfig({
                      ...config,
                      monitors: {
                        ...config.monitors,
                        ping: {
                          ...config.monitors.ping,
                          targets: [
                            ...config.monitors.ping.targets,
                            { host: '', name: '' },
                          ],
                        },
                      },
                    });
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  + Add Target
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Speedtest">
        <div className="space-y-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.monitors.speedtest.enabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  monitors: {
                    ...config.monitors,
                    speedtest: {
                      ...config.monitors.speedtest,
                      enabled: e.target.checked,
                    },
                  },
                })
              }
              className="w-4 h-4 rounded bg-gray-800 border-gray-700"
            />
            <span>Enabled</span>
          </label>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Interval (hours)
            </label>
            <input
              type="number"
              min={1}
              max={24}
              value={config.monitors.speedtest.intervalHours}
              onChange={(e) =>
                setConfig({
                  ...config,
                  monitors: {
                    ...config.monitors,
                    speedtest: {
                      ...config.monitors.speedtest,
                      intervalHours: parseInt(e.target.value, 10) || 1,
                    },
                  },
                })
              }
              className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
            />
            <span className="text-xs text-gray-500 ml-2">1-24 hours</span>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Server</label>
            {servers && servers.length > 0 ? (
              <select
                value={config.monitors.speedtest.serverId ?? ''}
                onChange={(e) =>
                  update((c) => {
                    c.monitors.speedtest.serverId = e.target.value || null;
                  })
                }
                className="w-full max-w-md px-3 py-2 bg-gray-800 border border-gray-700 rounded"
              >
                <option value="">Auto-select</option>
                {config.monitors.speedtest.serverId &&
                  !servers.some((s) => s.id === config.monitors.speedtest.serverId) && (
                    <option value={config.monitors.speedtest.serverId}>
                      Server #{config.monitors.speedtest.serverId}
                    </option>
                  )}
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.location}, {s.country}) #{s.id}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  type="text"
                  inputMode="numeric"
                  value={config.monitors.speedtest.serverId ?? ''}
                  onChange={(e) =>
                    update((c) => {
                      c.monitors.speedtest.serverId = e.target.value.trim() || null;
                    })
                  }
                  placeholder="Auto-select"
                  className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
                />
                <span className="text-xs text-gray-500 ml-2">
                  {servers ? 'Server list unavailable; enter an ID or leave blank' : 'Loading servers...'}
                </span>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card title="DNS Monitor">
        <div className="space-y-4">
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={config.monitors.dns.enabled}
              onChange={(e) =>
                setConfig({
                  ...config,
                  monitors: {
                    ...config.monitors,
                    dns: { ...config.monitors.dns, enabled: e.target.checked },
                  },
                })
              }
              className="w-4 h-4 rounded bg-gray-800 border-gray-700"
            />
            <span>Enabled</span>
          </label>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Interval (seconds)
            </label>
            <input
              type="number"
              min={60}
              max={1800}
              value={config.monitors.dns.intervalSeconds}
              onChange={(e) =>
                setConfig({
                  ...config,
                  monitors: {
                    ...config.monitors,
                    dns: {
                      ...config.monitors.dns,
                      intervalSeconds: parseInt(e.target.value, 10) || 300,
                    },
                  },
                })
              }
              className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
            />
            <span className="text-xs text-gray-500 ml-2">60-1800 seconds</span>
          </div>

          <NumberField
            label="Timeout (ms)"
            value={config.monitors.dns.timeout}
            min={1000}
            max={30000}
            unit="ms"
            onChange={(v) => update((c) => { c.monitors.dns.timeout = v; })}
          />

          <div>
            <label className="block text-sm text-gray-400 mb-2">Test domains</label>
            <div className="space-y-2">
              {config.monitors.dns.testDomains.map((domain, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) =>
                      update((c) => {
                        c.monitors.dns.testDomains[index] = e.target.value.trim();
                      })
                    }
                    placeholder="example.com"
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
                  />
                  {config.monitors.dns.testDomains.length > 1 && (
                    <button
                      onClick={() =>
                        update((c) => {
                          c.monitors.dns.testDomains.splice(index, 1);
                        })
                      }
                      className="px-3 py-2 text-red-400 hover:bg-red-900/30 rounded"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {config.monitors.dns.testDomains.length < 10 && (
                <button
                  onClick={() => update((c) => { c.monitors.dns.testDomains.push(''); })}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  + Add Domain
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Outage Detection">
        <div className="space-y-4">
          <NumberField
            label="Consecutive ping failures to declare an outage"
            value={config.outageDetection.pingFailuresForOutage}
            min={1}
            max={20}
            unit="failures"
            onChange={(v) => update((c) => { c.outageDetection.pingFailuresForOutage = v; })}
          />
          <NumberField
            label="Consecutive ping successes to declare recovery"
            value={config.outageDetection.pingSuccessesForRecovery}
            min={1}
            max={20}
            unit="successes"
            onChange={(v) => update((c) => { c.outageDetection.pingSuccessesForRecovery = v; })}
          />
        </div>
      </Card>

      <Card title="Data Retention">
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Retention Period (days)
          </label>
          <input
            type="number"
            min={7}
            max={365}
            value={config.retention.days}
            onChange={(e) =>
              setConfig({
                ...config,
                retention: {
                  ...config.retention,
                  days: parseInt(e.target.value, 10) || 90,
                },
              })
            }
            className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded"
          />
          <span className="text-xs text-gray-500 ml-2">7-365 days</span>
        </div>
      </Card>
    </div>
  );
}
