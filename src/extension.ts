import * as vscode from 'vscode';
import { VizServer } from './server/vizServer';
import { VizPanel } from './views/vizPanel';
import { IdeaGenerator } from './ai/ideaGenerator';
import { ExperimentsProvider, VisualizationsProvider, IdeasProvider } from './views/treeViews';
import { Visualization } from './types';

let server: VizServer | undefined;
let ideaGenerator: IdeaGenerator | undefined;
let experimentsProvider: ExperimentsProvider;
let visualizationsProvider: VisualizationsProvider;
let ideasProvider: IdeasProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('Model Viz extension activated');

  ideaGenerator = new IdeaGenerator();

  // Initialize tree view providers
  experimentsProvider = new ExperimentsProvider();
  visualizationsProvider = new VisualizationsProvider();
  ideasProvider = new IdeasProvider();

  // Register tree views
  vscode.window.registerTreeDataProvider('modelviz.experiments', experimentsProvider);
  vscode.window.registerTreeDataProvider('modelviz.visualizations', visualizationsProvider);
  vscode.window.registerTreeDataProvider('modelviz.ideas', ideasProvider);

  // Start server command
  const startServerCmd = vscode.commands.registerCommand('modelviz.startServer', async () => {
    if (server) {
      vscode.window.showWarningMessage('Model Viz server is already running');
      return;
    }

    const config = vscode.workspace.getConfiguration('modelviz');
    const port = config.get<number>('serverPort', 5678);

    server = new VizServer(port);

    try {
      await server.start();

      // Wire up events
      server.onMetric((metric) => {
        const panel = VizPanel.currentPanel;
        if (panel) {
          panel.updateMetrics(metric.runId, [metric]);
        }
      });

      server.onVisualization((viz) => {
        const panel = VizPanel.currentPanel;
        if (panel) {
          panel.addVisualization(viz);
        }
        visualizationsProvider.addVisualization(viz);
      });

      server.onRunUpdate((run) => {
        const panel = VizPanel.currentPanel;
        if (panel) {
          panel.updateRun({
            id: run.id,
            name: run.name,
            status: run.status,
          });
        }
        experimentsProvider.addRun(run);
      });

      server.onAnomaly(async (anomaly) => {
        const run = server?.getRun(anomaly.runId);
        if (run && ideaGenerator) {
          await ideaGenerator.handleAnomaly(anomaly, run);
        }

        // Show notification for high severity
        if (anomaly.severity === 'high') {
          vscode.window.showWarningMessage(
            `[Model Viz] Anomaly detected: ${anomaly.description}`,
            'Generate Ideas'
          ).then((action) => {
            if (action === 'Generate Ideas') {
              vscode.commands.executeCommand('modelviz.generateIdeas');
            }
          });
        }
      });

      server.onAsk(async ({ runId, question }) => {
        const run = server?.getRun(runId);
        if (run && ideaGenerator) {
          const ideas = await ideaGenerator.generateIdeas({
            run,
            userPrompt: question,
          });

          const panel = VizPanel.currentPanel;
          if (panel) {
            for (const idea of ideas) {
              panel.addIdea(idea);
            }
          }
        }
      });

      // Wire up idea generator events
      ideaGenerator.onIdea((idea) => {
        const panel = VizPanel.currentPanel;
        if (panel) {
          panel.addIdea(idea);
        }
        ideasProvider.addIdea(idea);
      });

    } catch (e) {
      vscode.window.showErrorMessage(`Failed to start Model Viz server: ${e}`);
    }
  });

  // Open panel command
  const openPanelCmd = vscode.commands.registerCommand('modelviz.openPanel', () => {
    VizPanel.createOrShow(context.extensionUri);
  });

  // Ask AI command
  const askAICmd = vscode.commands.registerCommand('modelviz.askAI', async () => {
    const question = await vscode.window.showInputBox({
      prompt: 'Ask about your experiment',
      placeHolder: 'Why might my loss be plateauing?',
    });

    if (!question) return;

    const runs = server?.getAllRuns() || [];
    const currentRun = runs.find(r => r.status === 'running') || runs[runs.length - 1];

    if (!currentRun) {
      vscode.window.showWarningMessage('No active experiment found');
      return;
    }

    if (ideaGenerator) {
      const ideas = await ideaGenerator.generateIdeas({
        run: currentRun,
        userPrompt: question,
      });

      const panel = VizPanel.currentPanel;
      if (panel) {
        for (const idea of ideas) {
          panel.addIdea(idea);
        }
      }
    }
  });

  // Generate ideas command
  const generateIdeasCmd = vscode.commands.registerCommand('modelviz.generateIdeas', async () => {
    const runs = server?.getAllRuns() || [];
    const currentRun = runs.find(r => r.status === 'running') || runs[runs.length - 1];

    if (!currentRun) {
      vscode.window.showWarningMessage('No active experiment found');
      return;
    }

    if (ideaGenerator) {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Generating investigation ideas...',
        cancellable: false
      }, async () => {
        const ideas = await ideaGenerator!.generateIdeas({
          run: currentRun,
          visualizations: currentRun.visualizations.slice(-10), // last 10 viz
        });

        const panel = VizPanel.currentPanel;
        if (panel) {
          for (const idea of ideas) {
            panel.addIdea(idea);
          }
        }
      });
    }
  });

  // Prompt visualization command
  const promptVizCmd = vscode.commands.registerCommand('modelviz.promptVisualization', async (prompt?: string) => {
    if (!prompt) {
      prompt = await vscode.window.showInputBox({
        prompt: 'Describe how you want to visualize your data',
        placeHolder: 'Show me loss grouped by learning rate as a heatmap',
      });
    }

    if (!prompt) return;

    // This would use AI to generate visualization code
    // For now, show that the feature is planned
    vscode.window.showInformationMessage(
      `Prompt-driven visualization coming soon: "${prompt}"`
    );
  });

  // Show visualization command (from tree view)
  const showVizCmd = vscode.commands.registerCommand('modelviz.showVisualization', (viz: Visualization) => {
    const panel = VizPanel.createOrShow(context.extensionUri);
    panel.addVisualization(viz);
  });

  context.subscriptions.push(
    startServerCmd,
    openPanelCmd,
    askAICmd,
    generateIdeasCmd,
    promptVizCmd,
    showVizCmd
  );

  // Auto-start server on activation
  vscode.commands.executeCommand('modelviz.startServer');
}

export function deactivate() {
  if (server) {
    server.stop();
  }
}
