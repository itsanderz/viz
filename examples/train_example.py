#!/usr/bin/env python3
"""
Example training script showing Model Viz integration.

This demonstrates how to:
1. Log metrics during training
2. Capture visualizations (attention maps, gradients, etc.)
3. Use the AI to generate investigation ideas

Run this while the VSCode extension is active to see live visualization.
"""

import modelviz as viz
import numpy as np
import time


def simulate_training():
    """Simulated training loop with various instrumentation"""

    # Initialize the run with config
    viz.init(
        name="gpt-nano-v2",
        config={
            "model": "transformer",
            "layers": 6,
            "heads": 8,
            "d_model": 512,
            "learning_rate": 3e-4,
            "batch_size": 64,
            "warmup_steps": 1000,
            "dataset": "openwebtext-subset",
        }
    )

    viz.note("Starting training run - testing new attention implementation")

    # Simulated training loop
    for step in range(500):
        # Simulate loss with some noise and gradual decrease
        base_loss = 4.0 * np.exp(-step / 200) + 0.5
        noise = np.random.normal(0, 0.1)
        loss = base_loss + noise

        # Simulate learning rate warmup then decay
        if step < 100:
            lr = 3e-4 * (step / 100)
        else:
            lr = 3e-4 * (1 - (step - 100) / 400)

        # Log metrics
        viz.log({
            "loss": loss,
            "lr": lr,
            "perplexity": np.exp(loss),
            "grad_norm": np.random.lognormal(0, 0.5),
        }, step=step)

        # Log visualizations periodically
        if step % 50 == 0:
            # Simulate attention pattern
            attention = np.random.rand(32, 32)
            attention = attention / attention.sum(axis=1, keepdims=True)
            viz.tensor("attention/layer_0", attention, step=step)

            # Simulate gradient histogram
            gradients = np.random.normal(0, 0.1, size=10000)
            viz.histogram("gradients/all", gradients, step=step)

        # Simulate an anomaly at step 200 (sudden loss spike)
        if step == 200:
            viz.log({"loss": loss + 2.0}, step=step)
            viz.note("Noticed a spike - might be related to learning rate?")

            # Ask the AI for ideas
            viz.ask(
                "My loss just spiked at step 200. "
                "The learning rate is near its peak. "
                "What might be causing this and how should I investigate?"
            )

        # Simulate some kind of plateau detection
        if step == 350:
            viz.ask(
                "Loss seems to be plateauing around 1.2. "
                "Is this expected? What could I try to push it lower?"
            )

        # Add small delay to make it more realistic
        time.sleep(0.02)

        if step % 100 == 0:
            print(f"Step {step}: loss={loss:.4f}, lr={lr:.6f}")

    viz.finish()
    print("Training complete!")


if __name__ == "__main__":
    simulate_training()
