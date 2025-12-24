// Core data types for the visualization system

export interface Metric {
  name: string;
  value: number;
  step: number;
  timestamp: number;
  runId: string;
  tags?: Record<string, string>;
}

export interface Visualization {
  id: string;
  type: 'image' | 'figure' | 'tensor' | 'histogram' | 'custom';
  name: string;
  data: string; // base64 encoded or JSON
  step: number;
  timestamp: number;
  runId: string;
  metadata?: Record<string, unknown>;
}

export interface Run {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  config: Record<string, unknown>;
  metrics: Map<string, Metric[]>;
  visualizations: Visualization[];
  notes: string[];
}

export interface Idea {
  id: string;
  content: string;
  timestamp: number;
  runId?: string;
  context: {
    metrics?: Metric[];
    visualizations?: string[]; // visualization IDs
    userPrompt?: string;
  };
  rating?: 'good' | 'bad' | 'neutral';
  followUp?: string[];
}

// Messages from Python SDK to extension
export type IncomingMessage =
  | { type: 'metric'; payload: Omit<Metric, 'timestamp'> }
  | { type: 'visualization'; payload: Omit<Visualization, 'timestamp'> }
  | { type: 'run_start'; payload: { id: string; name: string; config: Record<string, unknown> } }
  | { type: 'run_end'; payload: { id: string; status: Run['status'] } }
  | { type: 'note'; payload: { runId: string; content: string } }
  | { type: 'ask'; payload: { runId: string; question: string } };

// Messages from extension to webview
export type WebviewMessage =
  | { type: 'update_metrics'; payload: { runId: string; metrics: Metric[] } }
  | { type: 'add_visualization'; payload: Visualization }
  | { type: 'update_run'; payload: Partial<Run> & { id: string } }
  | { type: 'add_idea'; payload: Idea }
  | { type: 'theme_changed'; payload: { isDark: boolean } };

// Anomaly detection for proactive AI
export interface Anomaly {
  type: 'spike' | 'plateau' | 'divergence' | 'nan' | 'pattern';
  metric: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  step: number;
  runId: string;
}
