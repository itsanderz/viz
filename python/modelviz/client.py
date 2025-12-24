"""
Core client for Model Viz - handles communication with VSCode extension
"""

from __future__ import annotations

import base64
import io
import json
import os
import threading
import time
import uuid
from typing import Any, Optional, Union
import warnings

try:
    import websocket
except ImportError:
    websocket = None

try:
    import numpy as np
except ImportError:
    np = None

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import matplotlib
    import matplotlib.pyplot as plt
except ImportError:
    plt = None
    matplotlib = None


class VizClient:
    """Singleton client for communicating with Model Viz VSCode extension"""

    _instance: Optional[VizClient] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if hasattr(self, '_initialized'):
            return

        self._initialized = True
        self.ws: Optional[websocket.WebSocket] = None
        self.run_id: Optional[str] = None
        self.run_name: Optional[str] = None
        self.config: dict = {}
        self.step: int = 0
        self._connected = False
        self._port = int(os.environ.get('MODELVIZ_PORT', 5678))
        self._buffer: list[dict] = []
        self._buffer_lock = threading.Lock()

    def connect(self) -> bool:
        """Connect to the VSCode extension server"""
        if websocket is None:
            warnings.warn(
                "websocket-client not installed. Install with: pip install websocket-client"
            )
            return False

        try:
            self.ws = websocket.create_connection(
                f"ws://localhost:{self._port}",
                timeout=5
            )
            self._connected = True
            self._flush_buffer()
            return True
        except Exception as e:
            warnings.warn(f"Could not connect to Model Viz server: {e}")
            return False

    def _send(self, message: dict) -> None:
        """Send a message, buffering if not connected"""
        if self._connected and self.ws:
            try:
                self.ws.send(json.dumps(message))
            except Exception:
                self._connected = False
                with self._buffer_lock:
                    self._buffer.append(message)
        else:
            with self._buffer_lock:
                self._buffer.append(message)
                # Try to reconnect periodically
                if len(self._buffer) % 100 == 0:
                    self.connect()

    def _flush_buffer(self) -> None:
        """Send all buffered messages"""
        with self._buffer_lock:
            for message in self._buffer:
                if self.ws:
                    try:
                        self.ws.send(json.dumps(message))
                    except Exception:
                        break
            self._buffer.clear()

    def init_run(self, name: str, config: dict) -> str:
        """Initialize a new run"""
        self.run_id = str(uuid.uuid4())[:8]
        self.run_name = name
        self.config = config
        self.step = 0

        self.connect()

        self._send({
            "type": "run_start",
            "payload": {
                "id": self.run_id,
                "name": name,
                "config": config,
            }
        })

        return self.run_id

    def log_metric(self, name: str, value: float, step: Optional[int] = None) -> None:
        """Log a single metric"""
        if step is None:
            step = self.step

        self._send({
            "type": "metric",
            "payload": {
                "name": name,
                "value": float(value),
                "step": step,
                "runId": self.run_id,
            }
        })

    def log_image(
        self,
        name: str,
        data: Any,
        step: Optional[int] = None,
        metadata: Optional[dict] = None
    ) -> None:
        """Log an image visualization"""
        if step is None:
            step = self.step

        # Convert to base64 PNG
        b64_data = self._to_base64_image(data)

        self._send({
            "type": "visualization",
            "payload": {
                "id": f"{self.run_id}-{name}-{step}",
                "type": "image",
                "name": name,
                "data": b64_data,
                "step": step,
                "runId": self.run_id,
                "metadata": metadata,
            }
        })

    def log_figure(
        self,
        name: str,
        fig: Any = None,
        step: Optional[int] = None,
        metadata: Optional[dict] = None
    ) -> None:
        """Log a matplotlib figure"""
        if step is None:
            step = self.step

        if fig is None and plt is not None:
            fig = plt.gcf()

        b64_data = self._figure_to_base64(fig)

        self._send({
            "type": "visualization",
            "payload": {
                "id": f"{self.run_id}-{name}-{step}",
                "type": "figure",
                "name": name,
                "data": b64_data,
                "step": step,
                "runId": self.run_id,
                "metadata": metadata,
            }
        })

    def log_histogram(
        self,
        name: str,
        values: Any,
        step: Optional[int] = None,
        bins: int = 64
    ) -> None:
        """Log a histogram of values"""
        if step is None:
            step = self.step

        if np is not None and hasattr(values, '__array__'):
            values = np.array(values).flatten().tolist()

        # Compute histogram
        if np is not None:
            hist, edges = np.histogram(values, bins=bins)
            hist_data = {
                "counts": hist.tolist(),
                "edges": edges.tolist(),
            }
        else:
            hist_data = {"values": list(values)[:1000]}  # fallback

        self._send({
            "type": "visualization",
            "payload": {
                "id": f"{self.run_id}-{name}-{step}",
                "type": "histogram",
                "name": name,
                "data": json.dumps(hist_data),
                "step": step,
                "runId": self.run_id,
            }
        })

    def log_tensor(
        self,
        name: str,
        tensor: Any,
        step: Optional[int] = None,
        metadata: Optional[dict] = None
    ) -> None:
        """Log a tensor visualization (heatmap style)"""
        if step is None:
            step = self.step

        # Convert tensor to image
        if np is not None:
            arr = np.array(tensor)
            # Normalize to 0-255
            if arr.max() != arr.min():
                arr = (arr - arr.min()) / (arr.max() - arr.min())
            arr = (arr * 255).astype(np.uint8)

            # Use viridis colormap if matplotlib available
            if matplotlib is not None:
                cmap = plt.cm.viridis
                arr = (cmap(arr / 255.0)[:, :, :3] * 255).astype(np.uint8)

            b64_data = self._array_to_base64(arr)
        else:
            b64_data = ""

        self._send({
            "type": "visualization",
            "payload": {
                "id": f"{self.run_id}-{name}-{step}",
                "type": "tensor",
                "name": name,
                "data": b64_data,
                "step": step,
                "runId": self.run_id,
                "metadata": metadata,
            }
        })

    def log_note(self, content: str) -> None:
        """Log a text note"""
        self._send({
            "type": "note",
            "payload": {
                "runId": self.run_id,
                "content": content,
            }
        })

    def ask_ai(self, question: str) -> None:
        """Send a question to the AI for investigation ideas"""
        self._send({
            "type": "ask",
            "payload": {
                "runId": self.run_id,
                "question": question,
            }
        })

    def finish_run(self, status: str = "completed") -> None:
        """Mark the run as finished"""
        self._send({
            "type": "run_end",
            "payload": {
                "id": self.run_id,
                "status": status,
            }
        })

        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass

        self._connected = False

    def _to_base64_image(self, data: Any) -> str:
        """Convert various image formats to base64 PNG"""
        if isinstance(data, str):
            # Assume it's already base64
            return data

        if Image is not None:
            if isinstance(data, Image.Image):
                return self._pil_to_base64(data)

        if np is not None:
            if hasattr(data, '__array__'):
                return self._array_to_base64(np.array(data))

        # Try to handle PyTorch tensors
        if hasattr(data, 'detach') and hasattr(data, 'cpu'):
            arr = data.detach().cpu().numpy()
            return self._array_to_base64(arr)

        return ""

    def _pil_to_base64(self, img: Any) -> str:
        """Convert PIL Image to base64"""
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return base64.b64encode(buffer.getvalue()).decode()

    def _array_to_base64(self, arr: Any) -> str:
        """Convert numpy array to base64 PNG"""
        if Image is None:
            return ""

        # Handle different array shapes
        if len(arr.shape) == 2:
            # Grayscale
            mode = 'L'
        elif len(arr.shape) == 3:
            if arr.shape[2] == 3:
                mode = 'RGB'
            elif arr.shape[2] == 4:
                mode = 'RGBA'
            elif arr.shape[0] == 3:
                # CHW format
                arr = np.transpose(arr, (1, 2, 0))
                mode = 'RGB'
            else:
                mode = 'L'
                arr = arr[:, :, 0]
        else:
            return ""

        # Ensure uint8
        if arr.dtype != np.uint8:
            if arr.max() <= 1.0:
                arr = (arr * 255).astype(np.uint8)
            else:
                arr = arr.astype(np.uint8)

        img = Image.fromarray(arr, mode=mode)
        return self._pil_to_base64(img)

    def _figure_to_base64(self, fig: Any) -> str:
        """Convert matplotlib figure to base64 PNG"""
        if plt is None:
            return ""

        buffer = io.BytesIO()
        fig.savefig(buffer, format='png', dpi=100, bbox_inches='tight')
        buffer.seek(0)
        return base64.b64encode(buffer.read()).decode()


# Module-level singleton
_client: Optional[VizClient] = None


def _get_client() -> VizClient:
    global _client
    if _client is None:
        _client = VizClient()
    return _client


# Public API

def init(
    name: str = "experiment",
    config: Optional[dict] = None,
    port: Optional[int] = None
) -> str:
    """
    Initialize a new experiment run.

    Args:
        name: Name of the experiment
        config: Configuration dictionary (hyperparameters, etc.)
        port: Port for the visualization server (default: 5678)

    Returns:
        The run ID
    """
    client = _get_client()
    if port is not None:
        client._port = port
    return client.init_run(name, config or {})


def log(
    data: dict[str, float],
    step: Optional[int] = None,
    commit: bool = True
) -> None:
    """
    Log metrics.

    Args:
        data: Dictionary of metric names to values
        step: Step number (auto-incremented if not provided)
        commit: Whether to increment the step counter
    """
    client = _get_client()

    for name, value in data.items():
        client.log_metric(name, value, step)

    if commit and step is None:
        client.step += 1


def image(
    name: str,
    data: Any,
    step: Optional[int] = None,
    caption: Optional[str] = None
) -> None:
    """
    Log an image.

    Args:
        name: Name of the image
        data: Image data (PIL Image, numpy array, torch tensor, or base64 string)
        step: Step number
        caption: Optional caption
    """
    client = _get_client()
    metadata = {"caption": caption} if caption else None
    client.log_image(name, data, step, metadata)


def figure(
    name: str,
    fig: Any = None,
    step: Optional[int] = None
) -> None:
    """
    Log a matplotlib figure.

    Args:
        name: Name of the figure
        fig: Matplotlib figure (uses current figure if not provided)
        step: Step number
    """
    client = _get_client()
    client.log_figure(name, fig, step)


def histogram(
    name: str,
    values: Any,
    step: Optional[int] = None,
    bins: int = 64
) -> None:
    """
    Log a histogram.

    Args:
        name: Name of the histogram
        values: Values to histogram
        step: Step number
        bins: Number of bins
    """
    client = _get_client()
    client.log_histogram(name, values, step, bins)


def tensor(
    name: str,
    data: Any,
    step: Optional[int] = None
) -> None:
    """
    Log a tensor visualization (displayed as heatmap).

    Args:
        name: Name of the tensor
        data: Tensor data (numpy array or torch tensor)
        step: Step number
    """
    client = _get_client()
    client.log_tensor(name, data, step)


def note(content: str) -> None:
    """
    Log a text note.

    Args:
        content: Note content
    """
    client = _get_client()
    client.log_note(content)


def ask(question: str) -> None:
    """
    Ask the AI for investigation ideas.

    This sends a question to the VSCode extension, which will use AI
    to generate hypotheses and investigation ideas based on your
    experiment data.

    Args:
        question: Your question about the experiment
    """
    client = _get_client()
    client.ask_ai(question)


def finish(status: str = "completed") -> None:
    """
    Finish the current run.

    Args:
        status: Run status ('completed', 'failed', 'interrupted')
    """
    client = _get_client()
    client.finish_run(status)


def get_run_id() -> Optional[str]:
    """Get the current run ID."""
    client = _get_client()
    return client.run_id
