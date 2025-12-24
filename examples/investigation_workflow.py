#!/usr/bin/env python3
"""
Example of the investigation workflow with Model Viz.

This shows the user's described workflow:
1. Generate many visualizations during training
2. Use AI to analyze them and generate hypotheses
3. Investigate promising ideas

The key insight is that most ideas will be "shit" but occasionally
you get something good - or more often, it sparks a good idea in you.
"""

import modelviz as viz
import numpy as np
import time


def capture_model_internals(model_state: dict, step: int):
    """
    Capture various model internals for AI analysis.

    In a real scenario, you'd extract these from your actual model.
    """
    # Attention patterns
    for layer_idx in range(model_state["n_layers"]):
        # Simulate different attention patterns
        if layer_idx < 2:
            # Early layers: more uniform attention
            attn = np.random.rand(64, 64) ** 0.5
        else:
            # Later layers: more peaked attention
            attn = np.random.rand(64, 64) ** 2.0

        attn = attn / attn.sum(axis=1, keepdims=True)
        viz.tensor(f"attention/layer_{layer_idx}", attn, step=step)

    # Gradient norms per layer
    for layer_idx in range(model_state["n_layers"]):
        grad_norm = np.random.lognormal(
            -layer_idx * 0.5,  # Gradient vanishing simulation
            0.3
        )
        viz.log({f"grad_norm/layer_{layer_idx}": grad_norm}, step=step, commit=False)

    # Activation statistics
    for layer_idx in range(model_state["n_layers"]):
        activations = np.random.randn(1000) * (1 + layer_idx * 0.1)
        viz.histogram(f"activations/layer_{layer_idx}", activations, step=step)

    # Weight statistics
    weight_sparsity = 1 - np.exp(-step / 1000)  # Weights getting sparser over time
    viz.log({
        "weight_sparsity": weight_sparsity,
        "dead_neurons_pct": np.random.uniform(0.01, 0.05 + weight_sparsity * 0.1),
    }, step=step, commit=False)


def run_investigation_workflow():
    """
    Demonstrates the investigation workflow:
    1. Train with heavy instrumentation
    2. Periodically ask AI for hypotheses
    3. Log observations and ideas
    """

    viz.init(
        name="investigation-run",
        config={
            "model": "transformer",
            "n_layers": 12,
            "investigation_mode": True,
            "heavy_logging": True,
        }
    )

    model_state = {"n_layers": 12}

    viz.note("Starting heavy instrumentation run for investigation")

    for step in range(200):
        # Simulate training
        loss = 3.0 * np.exp(-step / 100) + 0.8 + np.random.normal(0, 0.05)
        viz.log({"loss": loss}, step=step)

        # Heavy instrumentation every 20 steps
        if step % 20 == 0:
            capture_model_internals(model_state, step)

        # At key investigation points, ask for hypotheses
        if step == 50:
            viz.ask(
                "I'm seeing gradient norms decrease by layer - "
                "classic vanishing gradient pattern. But the model is still "
                "learning. What's happening? Generate 5 hypotheses."
            )

        if step == 100:
            viz.ask(
                "Looking at the attention patterns: early layers are uniform, "
                "later layers are peaked. Is this expected? What does it suggest "
                "about what each layer is learning?"
            )

        if step == 150:
            viz.ask(
                "The dead neuron percentage is slowly increasing (now at ~8%). "
                "Combined with increasing weight sparsity, what might be happening? "
                "Should I be concerned? What experiments could test this?"
            )

        time.sleep(0.05)

        if step % 50 == 0:
            print(f"Step {step}: captured internals, loss={loss:.4f}")

    # Final analysis request
    viz.ask(
        "Run complete. Looking at all the data we've collected, what are the "
        "top 3 most interesting patterns you've noticed? For each pattern, "
        "suggest a specific experiment I could run to investigate further."
    )

    viz.finish()


def batch_analysis_workflow():
    """
    Shows how to use Model Viz for batch analysis of existing visualizations.

    This is for the case where you've already run training and want to
    analyze a bunch of saved images/data.
    """

    viz.init(
        name="batch-analysis",
        config={"mode": "analysis", "source": "previous_run_artifacts"}
    )

    # In practice, you'd load your saved visualizations here
    # For demo, we simulate

    viz.note("Analyzing 50 attention visualizations from previous run")

    # Simulate loading and logging many visualizations
    for i in range(50):
        # Simulate different attention patterns
        attn = np.random.rand(64, 64)
        if i < 20:
            attn = attn ** 0.3  # Early training: diffuse
        elif i < 40:
            attn = attn ** 1.0  # Mid training: moderate
        else:
            attn = attn ** 3.0  # Late training: peaked

        attn = attn / attn.sum(axis=1, keepdims=True)
        viz.tensor(f"analysis/attn_checkpoint_{i}", attn, step=i)

    # Now ask for bulk analysis
    viz.ask(
        "I've loaded 50 attention maps from different training checkpoints. "
        "Looking at how they evolve over time, what patterns do you see? "
        "What might explain the transition from diffuse to peaked attention? "
        "Generate a list of 10 possible explanations, ranging from obvious to speculative."
    )

    # Follow up with more specific questions
    viz.ask(
        "Of those explanations, which could I test by looking at other metrics "
        "I might have logged (loss curves, gradient norms, activation distributions)? "
        "Suggest specific things to look for."
    )

    viz.finish()


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "batch":
        batch_analysis_workflow()
    else:
        run_investigation_workflow()
