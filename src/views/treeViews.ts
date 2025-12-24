import * as vscode from 'vscode';
import { Run, Visualization, Idea } from '../types';

// Experiments Tree View
export class ExperimentsProvider implements vscode.TreeDataProvider<ExperimentItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ExperimentItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private runs: Run[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  addRun(run: Run): void {
    const existing = this.runs.findIndex(r => r.id === run.id);
    if (existing >= 0) {
      this.runs[existing] = run;
    } else {
      this.runs.unshift(run);
    }
    this.refresh();
  }

  updateRun(run: Partial<Run> & { id: string }): void {
    const existing = this.runs.find(r => r.id === run.id);
    if (existing) {
      Object.assign(existing, run);
      this.refresh();
    }
  }

  getTreeItem(element: ExperimentItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ExperimentItem): ExperimentItem[] {
    if (!element) {
      return this.runs.map(run => new ExperimentItem(
        run.name,
        run.status,
        run.id,
        vscode.TreeItemCollapsibleState.Collapsed
      ));
    }

    // Show run details
    const run = this.runs.find(r => r.id === element.runId);
    if (!run) return [];

    const items: ExperimentItem[] = [];

    // Config section
    items.push(new ExperimentItem(
      `Config: ${Object.keys(run.config).length} params`,
      'info',
      run.id,
      vscode.TreeItemCollapsibleState.None
    ));

    // Metrics summary
    items.push(new ExperimentItem(
      `Metrics: ${run.metrics.size} tracked`,
      'info',
      run.id,
      vscode.TreeItemCollapsibleState.None
    ));

    // Visualizations
    items.push(new ExperimentItem(
      `Visualizations: ${run.visualizations.length}`,
      'info',
      run.id,
      vscode.TreeItemCollapsibleState.None
    ));

    return items;
  }
}

class ExperimentItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly status: string,
    public readonly runId: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);

    this.tooltip = `${label} (${status})`;
    this.description = status;

    // Set icon based on status
    switch (status) {
      case 'running':
        this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('charts.green'));
        break;
      case 'completed':
        this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.foreground'));
        break;
      case 'failed':
        this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('beaker');
    }

    this.contextValue = 'experiment';
  }
}

// Visualizations Tree View
export class VisualizationsProvider implements vscode.TreeDataProvider<VizItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<VizItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private visualizations: Visualization[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  addVisualization(viz: Visualization): void {
    this.visualizations.unshift(viz);
    // Keep last 100
    if (this.visualizations.length > 100) {
      this.visualizations = this.visualizations.slice(0, 100);
    }
    this.refresh();
  }

  getTreeItem(element: VizItem): vscode.TreeItem {
    return element;
  }

  getChildren(): VizItem[] {
    return this.visualizations.map(viz => new VizItem(viz));
  }
}

class VizItem extends vscode.TreeItem {
  constructor(viz: Visualization) {
    super(viz.name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = `${viz.type} at step ${viz.step}`;
    this.description = `step ${viz.step}`;

    // Set icon based on type
    switch (viz.type) {
      case 'image':
        this.iconPath = new vscode.ThemeIcon('file-media');
        break;
      case 'figure':
        this.iconPath = new vscode.ThemeIcon('graph');
        break;
      case 'histogram':
        this.iconPath = new vscode.ThemeIcon('graph-left');
        break;
      case 'tensor':
        this.iconPath = new vscode.ThemeIcon('symbol-array');
        break;
      default:
        this.iconPath = new vscode.ThemeIcon('file');
    }

    this.contextValue = 'visualization';

    // Command to show in panel
    this.command = {
      command: 'modelviz.showVisualization',
      title: 'Show Visualization',
      arguments: [viz]
    };
  }
}

// Ideas Tree View
export class IdeasProvider implements vscode.TreeDataProvider<IdeaItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<IdeaItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private ideas: Idea[] = [];

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  addIdea(idea: Idea): void {
    this.ideas.unshift(idea);
    this.refresh();
  }

  getTreeItem(element: IdeaItem): vscode.TreeItem {
    return element;
  }

  getChildren(): IdeaItem[] {
    return this.ideas.map(idea => new IdeaItem(idea));
  }
}

class IdeaItem extends vscode.TreeItem {
  constructor(idea: Idea) {
    // Truncate content for tree view
    const shortContent = idea.content.length > 60
      ? idea.content.substring(0, 60) + '...'
      : idea.content;

    super(shortContent, vscode.TreeItemCollapsibleState.None);

    this.tooltip = idea.content;
    this.description = new Date(idea.timestamp).toLocaleTimeString();

    // Icon based on rating
    if (idea.rating === 'good') {
      this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
    } else if (idea.rating === 'bad') {
      this.iconPath = new vscode.ThemeIcon('star-empty');
    } else {
      this.iconPath = new vscode.ThemeIcon('lightbulb');
    }

    this.contextValue = 'idea';
  }
}
