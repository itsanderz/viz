import * as vscode from 'vscode';
import { Metric, Visualization, Run, Idea, WebviewMessage } from '../types';

export class VizPanel {
  public static currentPanel: VizPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getWebviewContent();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (message) => this._handleMessage(message),
      null,
      this._disposables
    );
  }

  public static createOrShow(extensionUri: vscode.Uri): VizPanel {
    const column = vscode.ViewColumn.Beside;

    if (VizPanel.currentPanel) {
      VizPanel.currentPanel._panel.reveal(column);
      return VizPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'modelvizPanel',
      'Model Viz',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      }
    );

    VizPanel.currentPanel = new VizPanel(panel, extensionUri);
    return VizPanel.currentPanel;
  }

  public updateMetrics(runId: string, metrics: Metric[]): void {
    this._postMessage({ type: 'update_metrics', payload: { runId, metrics } });
  }

  public addVisualization(viz: Visualization): void {
    this._postMessage({ type: 'add_visualization', payload: viz });
  }

  public updateRun(run: Partial<Run> & { id: string }): void {
    this._postMessage({ type: 'update_run', payload: run });
  }

  public addIdea(idea: Idea): void {
    this._postMessage({ type: 'add_idea', payload: idea });
  }

  private _postMessage(message: WebviewMessage): void {
    this._panel.webview.postMessage(message);
  }

  private _handleMessage(message: { type: string; payload?: unknown }): void {
    switch (message.type) {
      case 'request_ideas':
        vscode.commands.executeCommand('modelviz.generateIdeas');
        break;
      case 'rate_idea':
        // Handle idea rating
        break;
      case 'prompt_viz':
        // Handle custom visualization prompts
        vscode.commands.executeCommand('modelviz.promptVisualization', message.payload);
        break;
    }
  }

  public dispose(): void {
    VizPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _getWebviewContent(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Model Viz</title>
  <script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-textLink-foreground);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 100vh;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .header h1 {
      font-size: 18px;
      font-weight: 500;
    }

    .prompt-bar {
      display: flex;
      gap: 8px;
      padding: 12px;
      background: var(--bg-secondary);
      border-radius: 6px;
      border: 1px solid var(--border);
    }

    .prompt-bar input {
      flex: 1;
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 8px 12px;
      color: var(--text-primary);
      font-size: 13px;
    }

    .prompt-bar input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .prompt-bar button {
      background: var(--accent);
      color: var(--bg-primary);
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
    }

    .prompt-bar button:hover {
      opacity: 0.9;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 16px;
      flex: 1;
    }

    .panel {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: rgba(0,0,0,0.1);
      border-bottom: 1px solid var(--border);
    }

    .panel-header h2 {
      font-size: 13px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .panel-content {
      padding: 14px;
      flex: 1;
      overflow: auto;
    }

    .metric-chart {
      width: 100%;
      height: 250px;
    }

    .viz-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
    }

    .viz-item {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 8px;
      cursor: pointer;
      transition: border-color 0.2s;
    }

    .viz-item:hover {
      border-color: var(--accent);
    }

    .viz-item img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: contain;
      background: #000;
      border-radius: 2px;
    }

    .viz-item .label {
      font-size: 11px;
      color: var(--text-secondary);
      margin-top: 6px;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }

    .idea-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .idea-item {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 12px;
    }

    .idea-item .content {
      font-size: 13px;
      line-height: 1.5;
    }

    .idea-item .meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .idea-actions {
      display: flex;
      gap: 4px;
    }

    .idea-actions button {
      background: none;
      border: 1px solid var(--border);
      border-radius: 2px;
      padding: 2px 6px;
      cursor: pointer;
      font-size: 11px;
      color: var(--text-secondary);
    }

    .idea-actions button:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: var(--text-secondary);
      text-align: center;
    }

    .empty-state .icon {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
    }

    .status-running {
      background: #28a745;
      color: white;
    }

    .status-completed {
      background: #6c757d;
      color: white;
    }

    .status-failed {
      background: #dc3545;
      color: white;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Model Viz</h1>
    <div id="run-status"></div>
  </div>

  <div class="prompt-bar">
    <input type="text" id="prompt-input" placeholder="Ask about your experiment or describe how you want to visualize data...">
    <button onclick="submitPrompt()">Ask AI</button>
  </div>

  <div class="grid">
    <div class="panel">
      <div class="panel-header">
        <h2>Metrics</h2>
        <select id="metric-select" onchange="updateChart()">
          <option value="">Select metric...</option>
        </select>
      </div>
      <div class="panel-content">
        <div id="metric-chart" class="metric-chart"></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h2>Visualizations</h2>
        <span id="viz-count">0 items</span>
      </div>
      <div class="panel-content">
        <div id="viz-grid" class="viz-grid">
          <div class="empty-state">
            <div class="icon">📊</div>
            <div>No visualizations yet</div>
            <div style="font-size: 11px; margin-top: 4px;">Use viz.image() or viz.figure() in your training script</div>
          </div>
        </div>
      </div>
    </div>

    <div class="panel" style="grid-column: 1 / -1;">
      <div class="panel-header">
        <h2>AI Ideas</h2>
        <button onclick="requestIdeas()">Generate Ideas</button>
      </div>
      <div class="panel-content">
        <div id="idea-list" class="idea-list">
          <div class="empty-state">
            <div class="icon">💡</div>
            <div>No ideas yet</div>
            <div style="font-size: 11px; margin-top: 4px;">Click "Generate Ideas" or ask a question above</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    let metrics = {};
    let visualizations = [];
    let ideas = [];
    let currentRun = null;

    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'update_metrics':
          handleMetricsUpdate(message.payload);
          break;
        case 'add_visualization':
          handleVisualization(message.payload);
          break;
        case 'update_run':
          handleRunUpdate(message.payload);
          break;
        case 'add_idea':
          handleIdea(message.payload);
          break;
      }
    });

    function handleMetricsUpdate(payload) {
      const { runId, metrics: newMetrics } = payload;

      for (const metric of newMetrics) {
        if (!metrics[metric.name]) {
          metrics[metric.name] = [];
          addMetricOption(metric.name);
        }
        metrics[metric.name].push(metric);
      }

      updateChart();
    }

    function addMetricOption(name) {
      const select = document.getElementById('metric-select');
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);

      if (select.options.length === 2) {
        select.value = name;
        updateChart();
      }
    }

    function updateChart() {
      const select = document.getElementById('metric-select');
      const selectedMetric = select.value;

      if (!selectedMetric || !metrics[selectedMetric]) return;

      const data = metrics[selectedMetric];

      const trace = {
        x: data.map(m => m.step),
        y: data.map(m => m.value),
        type: 'scatter',
        mode: 'lines',
        line: { color: '#4CAF50', width: 2 },
        name: selectedMetric
      };

      const layout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: getComputedStyle(document.body).getPropertyValue('--text-primary') },
        margin: { t: 20, r: 20, b: 40, l: 50 },
        xaxis: { title: 'Step', gridcolor: 'rgba(128,128,128,0.2)' },
        yaxis: { title: selectedMetric, gridcolor: 'rgba(128,128,128,0.2)' }
      };

      Plotly.newPlot('metric-chart', [trace], layout, { responsive: true });
    }

    function handleVisualization(viz) {
      visualizations.push(viz);
      renderVisualizations();
    }

    function renderVisualizations() {
      const grid = document.getElementById('viz-grid');
      const count = document.getElementById('viz-count');

      count.textContent = visualizations.length + ' items';

      if (visualizations.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="icon">📊</div><div>No visualizations yet</div></div>';
        return;
      }

      grid.innerHTML = visualizations.map(viz => {
        if (viz.type === 'image') {
          return '<div class="viz-item" onclick="showViz(\\'${viz.id}\\')">' +
            '<img src="data:image/png;base64,${viz.data}">' +
            '<div class="label">${viz.name} (step ${viz.step})</div>' +
          '</div>';
        }
        return '<div class="viz-item"><div class="label">${viz.name}</div></div>';
      }).join('');
    }

    function handleRunUpdate(run) {
      currentRun = { ...currentRun, ...run };

      const statusDiv = document.getElementById('run-status');
      const statusClass = 'status-' + (run.status || 'running');
      statusDiv.innerHTML = '<span class="status-badge ' + statusClass + '">' + (run.status || 'running').toUpperCase() + '</span> ' + (run.name || 'Unnamed Run');
    }

    function handleIdea(idea) {
      ideas.push(idea);
      renderIdeas();
    }

    function renderIdeas() {
      const list = document.getElementById('idea-list');

      if (ideas.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="icon">💡</div><div>No ideas yet</div></div>';
        return;
      }

      list.innerHTML = ideas.map(idea =>
        '<div class="idea-item">' +
          '<div class="content">' + idea.content + '</div>' +
          '<div class="meta">' +
            '<span>' + new Date(idea.timestamp).toLocaleTimeString() + '</span>' +
            '<div class="idea-actions">' +
              '<button onclick="rateIdea(\\'${idea.id}\\', \\'good\\')">👍</button>' +
              '<button onclick="rateIdea(\\'${idea.id}\\', \\'bad\\')">👎</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      ).join('');
    }

    function submitPrompt() {
      const input = document.getElementById('prompt-input');
      const prompt = input.value.trim();
      if (!prompt) return;

      vscode.postMessage({ type: 'prompt_viz', payload: prompt });
      input.value = '';
    }

    function requestIdeas() {
      vscode.postMessage({ type: 'request_ideas' });
    }

    function rateIdea(id, rating) {
      vscode.postMessage({ type: 'rate_idea', payload: { id, rating } });
    }

    function showViz(id) {
      // Could open in larger view
    }

    // Handle enter key in prompt
    document.getElementById('prompt-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitPrompt();
    });
  </script>
</body>
</html>`;
  }
}
