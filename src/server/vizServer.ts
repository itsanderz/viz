import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Metric, Visualization, Run, Anomaly } from '../types';

export class VizServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private runs: Map<string, Run> = new Map();

  // Event emitters for the rest of the extension
  private _onMetric = new vscode.EventEmitter<Metric>();
  private _onVisualization = new vscode.EventEmitter<Visualization>();
  private _onRunUpdate = new vscode.EventEmitter<Run>();
  private _onAnomaly = new vscode.EventEmitter<Anomaly>();
  private _onAsk = new vscode.EventEmitter<{ runId: string; question: string }>();

  readonly onMetric = this._onMetric.event;
  readonly onVisualization = this._onVisualization.event;
  readonly onRunUpdate = this._onRunUpdate.event;
  readonly onAnomaly = this._onAnomaly.event;
  readonly onAsk = this._onAsk.event;

  constructor(port: number = 5678) {
    this.port = port;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({ port: this.port });

        this.wss.on('connection', (ws: WebSocket) => {
          console.log('Python client connected');

          ws.on('message', (data: Buffer) => {
            try {
              const message: IncomingMessage = JSON.parse(data.toString());
              this.handleMessage(message);
            } catch (e) {
              console.error('Failed to parse message:', e);
            }
          });

          ws.on('close', () => {
            console.log('Python client disconnected');
          });
        });

        this.wss.on('listening', () => {
          vscode.window.showInformationMessage(`Model Viz server started on port ${this.port}`);
          resolve();
        });

        this.wss.on('error', (err) => {
          reject(err);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  private handleMessage(message: IncomingMessage): void {
    const timestamp = Date.now();

    switch (message.type) {
      case 'metric': {
        const metric: Metric = { ...message.payload, timestamp };
        this.addMetric(metric);
        this._onMetric.fire(metric);
        this.checkForAnomalies(metric);
        break;
      }

      case 'visualization': {
        const viz: Visualization = { ...message.payload, timestamp };
        this.addVisualization(viz);
        this._onVisualization.fire(viz);
        break;
      }

      case 'run_start': {
        const run: Run = {
          id: message.payload.id,
          name: message.payload.name,
          startTime: timestamp,
          status: 'running',
          config: message.payload.config,
          metrics: new Map(),
          visualizations: [],
          notes: [],
        };
        this.runs.set(run.id, run);
        this._onRunUpdate.fire(run);
        break;
      }

      case 'run_end': {
        const run = this.runs.get(message.payload.id);
        if (run) {
          run.status = message.payload.status;
          run.endTime = timestamp;
          this._onRunUpdate.fire(run);
        }
        break;
      }

      case 'note': {
        const run = this.runs.get(message.payload.runId);
        if (run) {
          run.notes.push(message.payload.content);
          this._onRunUpdate.fire(run);
        }
        break;
      }

      case 'ask': {
        this._onAsk.fire(message.payload);
        break;
      }
    }
  }

  private addMetric(metric: Metric): void {
    const run = this.runs.get(metric.runId);
    if (run) {
      if (!run.metrics.has(metric.name)) {
        run.metrics.set(metric.name, []);
      }
      run.metrics.get(metric.name)!.push(metric);
    }
  }

  private addVisualization(viz: Visualization): void {
    const run = this.runs.get(viz.runId);
    if (run) {
      run.visualizations.push(viz);
    }
  }

  private checkForAnomalies(metric: Metric): void {
    const run = this.runs.get(metric.runId);
    if (!run) return;

    const history = run.metrics.get(metric.name);
    if (!history || history.length < 10) return;

    // Check for NaN/Inf
    if (!isFinite(metric.value)) {
      this._onAnomaly.fire({
        type: 'nan',
        metric: metric.name,
        severity: 'high',
        description: `${metric.name} became ${metric.value}`,
        step: metric.step,
        runId: metric.runId,
      });
      return;
    }

    // Check for spike (value > 3 std devs from recent mean)
    const recent = history.slice(-20);
    const mean = recent.reduce((a, b) => a + b.value, 0) / recent.length;
    const std = Math.sqrt(recent.reduce((a, b) => a + Math.pow(b.value - mean, 2), 0) / recent.length);

    if (std > 0 && Math.abs(metric.value - mean) > 3 * std) {
      this._onAnomaly.fire({
        type: 'spike',
        metric: metric.name,
        severity: 'medium',
        description: `${metric.name} spiked to ${metric.value.toFixed(4)} (mean: ${mean.toFixed(4)}, std: ${std.toFixed(4)})`,
        step: metric.step,
        runId: metric.runId,
      });
    }

    // Check for plateau (no significant change in last N steps)
    if (history.length >= 50) {
      const last50 = history.slice(-50);
      const range = Math.max(...last50.map(m => m.value)) - Math.min(...last50.map(m => m.value));
      const avgValue = last50.reduce((a, b) => a + b.value, 0) / last50.length;

      if (avgValue !== 0 && range / Math.abs(avgValue) < 0.001) {
        this._onAnomaly.fire({
          type: 'plateau',
          metric: metric.name,
          severity: 'low',
          description: `${metric.name} has plateaued around ${avgValue.toFixed(4)}`,
          step: metric.step,
          runId: metric.runId,
        });
      }
    }
  }

  getRun(id: string): Run | undefined {
    return this.runs.get(id);
  }

  getAllRuns(): Run[] {
    return Array.from(this.runs.values());
  }

  getMetrics(runId: string): Map<string, Metric[]> | undefined {
    return this.runs.get(runId)?.metrics;
  }
}
