import * as vscode from 'vscode';
import { Metric, Visualization, Run, Anomaly, Idea } from '../types';

export class IdeaGenerator {
  private _onIdea = new vscode.EventEmitter<Idea>();
  readonly onIdea = this._onIdea.event;

  private recentAnomalies: Anomaly[] = [];
  private ideaHistory: Idea[] = [];

  /**
   * Generate ideas based on current state and optional user prompt
   */
  async generateIdeas(options: {
    run?: Run;
    anomalies?: Anomaly[];
    visualizations?: Visualization[];
    userPrompt?: string;
    context?: string;
  }): Promise<Idea[]> {
    const prompt = this.buildPrompt(options);

    // For now, we'll structure this to work with Claude API
    // The actual API call would be made here
    const ideas = await this.callAI(prompt);

    for (const idea of ideas) {
      this.ideaHistory.push(idea);
      this._onIdea.fire(idea);
    }

    return ideas;
  }

  private buildPrompt(options: {
    run?: Run;
    anomalies?: Anomaly[];
    visualizations?: Visualization[];
    userPrompt?: string;
    context?: string;
  }): string {
    const parts: string[] = [];

    parts.push(`You are an ML research assistant helping analyze an experiment.`);
    parts.push(`Your job is to generate investigation ideas - hypotheses about what might be happening and why.`);
    parts.push(`Be specific and actionable. Think like a researcher debugging their model.`);
    parts.push(``);

    if (options.run) {
      parts.push(`## Current Run: ${options.run.name}`);
      parts.push(`Status: ${options.run.status}`);
      parts.push(`Config: ${JSON.stringify(options.run.config, null, 2)}`);
      parts.push(``);

      // Add metric summaries
      if (options.run.metrics.size > 0) {
        parts.push(`## Metrics Summary:`);
        for (const [name, values] of options.run.metrics) {
          if (values.length > 0) {
            const last = values[values.length - 1];
            const first = values[0];
            const min = Math.min(...values.map(v => v.value));
            const max = Math.max(...values.map(v => v.value));
            parts.push(`- ${name}: current=${last.value.toFixed(4)}, start=${first.value.toFixed(4)}, min=${min.toFixed(4)}, max=${max.toFixed(4)}, steps=${values.length}`);
          }
        }
        parts.push(``);
      }
    }

    if (options.anomalies && options.anomalies.length > 0) {
      parts.push(`## Detected Anomalies:`);
      for (const anomaly of options.anomalies) {
        parts.push(`- [${anomaly.severity.toUpperCase()}] ${anomaly.type}: ${anomaly.description} (step ${anomaly.step})`);
      }
      parts.push(``);
    }

    if (options.visualizations && options.visualizations.length > 0) {
      parts.push(`## Visualizations Available:`);
      for (const viz of options.visualizations) {
        parts.push(`- ${viz.name} (${viz.type}) at step ${viz.step}`);
        if (viz.metadata) {
          parts.push(`  Metadata: ${JSON.stringify(viz.metadata)}`);
        }
      }
      parts.push(``);
    }

    if (options.context) {
      parts.push(`## Additional Context:`);
      parts.push(options.context);
      parts.push(``);
    }

    if (options.userPrompt) {
      parts.push(`## User Question:`);
      parts.push(options.userPrompt);
      parts.push(``);
    }

    parts.push(`## Instructions:`);
    parts.push(`Generate 3-5 specific investigation ideas. For each idea:`);
    parts.push(`1. State the hypothesis clearly`);
    parts.push(`2. Explain what evidence supports or would test this hypothesis`);
    parts.push(`3. Suggest a concrete next step to investigate`);
    parts.push(``);
    parts.push(`Format each idea as a JSON object with fields: hypothesis, evidence, next_step`);
    parts.push(`Return a JSON array of ideas.`);

    return parts.join('\n');
  }

  private async callAI(prompt: string): Promise<Idea[]> {
    // This would integrate with Claude API
    // For now, return a structured placeholder that shows the format

    // In production, this would be:
    // const response = await anthropic.messages.create({
    //   model: config.aiModel,
    //   messages: [{ role: 'user', content: prompt }],
    //   max_tokens: 2000,
    // });

    // Parse response and convert to Idea format

    // Placeholder for demonstration
    const ideas: Idea[] = [
      {
        id: `idea-${Date.now()}-1`,
        content: '[AI integration pending] This will generate hypotheses based on your experiment data.',
        timestamp: Date.now(),
        context: { userPrompt: prompt.slice(0, 100) },
      }
    ];

    return ideas;
  }

  /**
   * Called when an anomaly is detected - can proactively generate ideas
   */
  async handleAnomaly(anomaly: Anomaly, run: Run): Promise<void> {
    this.recentAnomalies.push(anomaly);

    // Keep only recent anomalies (last 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    this.recentAnomalies = this.recentAnomalies.filter(a => a.step > 0); // simplified

    const config = vscode.workspace.getConfiguration('modelviz');
    const autoGenerate = config.get<boolean>('autoGenerateIdeas', false);

    if (autoGenerate && anomaly.severity === 'high') {
      await this.generateIdeas({
        run,
        anomalies: [anomaly],
        userPrompt: `An anomaly was detected: ${anomaly.description}. What might be causing this?`,
      });
    }
  }

  /**
   * Analyze visualizations using vision capabilities
   */
  async analyzeVisualization(viz: Visualization, context?: string): Promise<Idea[]> {
    // This would use Claude's vision capabilities to analyze the visualization
    // For image type visualizations, we'd send the base64 data directly

    const prompt = `
Analyze this visualization and generate investigation ideas.

Visualization: ${viz.name}
Type: ${viz.type}
Step: ${viz.step}
${viz.metadata ? `Metadata: ${JSON.stringify(viz.metadata)}` : ''}
${context ? `Context: ${context}` : ''}

What patterns do you see? What might they indicate about the model's behavior?
Generate specific hypotheses to investigate.
    `.trim();

    return this.callAI(prompt);
  }

  getIdeaHistory(): Idea[] {
    return [...this.ideaHistory];
  }

  rateIdea(ideaId: string, rating: 'good' | 'bad' | 'neutral'): void {
    const idea = this.ideaHistory.find(i => i.id === ideaId);
    if (idea) {
      idea.rating = rating;
    }
  }
}
