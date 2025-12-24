"""
Model Viz - AI-powered experiment tracking and visualization

Example usage:
    import modelviz as viz

    viz.init("my-experiment", config={"lr": 0.001, "batch_size": 32})

    for step in range(1000):
        loss = train_step()
        viz.log({"loss": loss, "lr": scheduler.get_lr()}, step=step)

        if step % 100 == 0:
            viz.image("attention", attention_map, step=step)

    # Ask AI for investigation ideas
    ideas = viz.ask("Why might my loss be plateauing?")
    for idea in ideas:
        print(idea)

    viz.finish()
"""

from .client import (
    init,
    log,
    image,
    figure,
    histogram,
    tensor,
    note,
    ask,
    finish,
    get_run_id,
)

__version__ = "0.1.0"
__all__ = [
    "init",
    "log",
    "image",
    "figure",
    "histogram",
    "tensor",
    "note",
    "ask",
    "finish",
    "get_run_id",
]
