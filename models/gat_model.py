"""
AEGIS — Heterogeneous Graph Attention Network (GAT)
2-layer HeteroGAT for node-level fraud detection on transaction graphs.
Uses PyTorch Geometric's HeteroConv with GATConv layers.
"""
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import os
import logging
from typing import Dict, Optional, Tuple

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Check for PyG availability
try:
    from torch_geometric.nn import GATConv, HeteroConv, Linear
    from torch_geometric.data import HeteroData
    PYG_AVAILABLE = True
except ImportError:
    PYG_AVAILABLE = False
    logger.warning("torch_geometric not available. GAT model will not work.")


class HeteroGAT(nn.Module):
    """
    2-layer Heterogeneous Graph Attention Network.
    Operates on account node type with TRANSFER edge type.
    
    Architecture:
        Input → GATConv(heads=4, hidden=64) → ELU → Dropout
              → GATConv(heads=1, out=32) → Output embeddings
    """
    def __init__(self, in_channels: int = -1, hidden_channels: int = 64,
                 out_channels: int = 32, heads: int = 4, dropout: float = 0.3):
        super().__init__()
        
        self.dropout = dropout
        
        self.conv1 = HeteroConv({
            ("account", "transfers", "account"): GATConv(
                in_channels, hidden_channels, heads=heads,
                dropout=dropout, add_self_loops=False
            ),
        }, aggr="sum")

        self.conv2 = HeteroConv({
            ("account", "transfers", "account"): GATConv(
                hidden_channels * heads, out_channels,
                heads=1, concat=False,
                dropout=dropout, add_self_loops=False
            ),
        }, aggr="sum")
        
        # Classification head
        self.classifier = nn.Sequential(
            nn.Linear(out_channels, 16),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(16, 2),
        )

    def forward(self, x_dict, edge_index_dict):
        """Forward pass returning node embeddings."""
        x_dict = self.conv1(x_dict, edge_index_dict)
        x_dict = {k: F.elu(v) for k, v in x_dict.items()}
        x_dict = {k: F.dropout(v, p=self.dropout, training=self.training)
                   for k, v in x_dict.items()}
        x_dict = self.conv2(x_dict, edge_index_dict)
        return x_dict
    
    def predict(self, x_dict, edge_index_dict):
        """Forward pass with classification logits."""
        embeddings = self.forward(x_dict, edge_index_dict)
        logits = {}
        for node_type, emb in embeddings.items():
            logits[node_type] = self.classifier(emb)
        return logits, embeddings


def get_gnn_embeddings(model: HeteroGAT, data: "HeteroData") -> Dict[str, np.ndarray]:
    """Extract node embeddings for use as features in LightGBM."""
    model.eval()
    device = next(model.parameters()).device
    
    x_dict = {k: v.to(device) for k, v in data.x_dict.items()}
    edge_index_dict = {k: v.to(device) for k, v in data.edge_index_dict.items()}
    
    with torch.no_grad():
        embeddings = model(x_dict, edge_index_dict)
    
    return {
        node_type: emb.cpu().numpy()
        for node_type, emb in embeddings.items()
    }


def train_gat(
    data: "HeteroData",
    epochs: int = 200,
    lr: float = 0.005,
    weight_decay: float = 5e-4,
    patience: int = 30,
    device: str = "auto",
    hidden_channels: int = 64,
    out_channels: int = 32,
    heads: int = 4,
) -> Tuple[HeteroGAT, dict]:
    """
    Train the HeteroGAT model with early stopping.
    Handles class imbalance with weighted loss.
    
    Returns: (trained_model, metrics_dict)
    """
    if not PYG_AVAILABLE:
        raise ImportError("torch_geometric is required for GAT training")
    
    # Device selection
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Training on device: {device}")
    
    # Get labels for class weighting
    labels = data["account"].y
    num_fraud = (labels == 1).sum().item()
    num_legit = (labels == 0).sum().item()
    total = num_fraud + num_legit
    
    if num_fraud == 0:
        logger.warning("No fraud labels found! Using uniform weights.")
        class_weights = torch.tensor([1.0, 1.0])
    else:
        # Inverse frequency weighting
        class_weights = torch.tensor([
            total / (2 * num_legit),
            total / (2 * num_fraud)
        ])
    
    logger.info(f"Class distribution: {num_legit:,} legit, {num_fraud:,} fraud")
    logger.info(f"Class weights: {class_weights.tolist()}")
    
    # Train/val split (chronological if possible, random otherwise)
    num_nodes = labels.shape[0]
    indices = torch.randperm(num_nodes)
    train_size = int(0.8 * num_nodes)
    
    train_mask = torch.zeros(num_nodes, dtype=torch.bool)
    val_mask = torch.zeros(num_nodes, dtype=torch.bool)
    train_mask[indices[:train_size]] = True
    val_mask[indices[train_size:]] = True
    
    data["account"].train_mask = train_mask
    data["account"].val_mask = val_mask
    
    # Move to device
    data = data.to(device)
    class_weights = class_weights.to(device)
    
    in_channels = data["account"].x.shape[1]
    
    model = HeteroGAT(
        in_channels=in_channels,
        hidden_channels=hidden_channels,
        out_channels=out_channels,
        heads=heads,
    ).to(device)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    criterion = nn.CrossEntropyLoss(weight=class_weights)
    
    best_val_loss = float("inf")
    best_model_state = None
    patience_counter = 0
    history = {"train_loss": [], "val_loss": [], "val_acc": []}
    
    logger.info(f"Starting training for up to {epochs} epochs...")
    
    for epoch in range(epochs):
        # Training
        model.train()
        optimizer.zero_grad()
        
        logits, _ = model.predict(data.x_dict, data.edge_index_dict)
        account_logits = logits["account"]
        
        train_loss = criterion(
            account_logits[data["account"].train_mask],
            data["account"].y[data["account"].train_mask]
        )
        train_loss.backward()
        optimizer.step()
        
        # Validation
        model.eval()
        with torch.no_grad():
            logits, _ = model.predict(data.x_dict, data.edge_index_dict)
            account_logits = logits["account"]
            
            val_loss = criterion(
                account_logits[data["account"].val_mask],
                data["account"].y[data["account"].val_mask]
            ).item()
            
            val_pred = account_logits[data["account"].val_mask].argmax(dim=1)
            val_true = data["account"].y[data["account"].val_mask]
            val_acc = (val_pred == val_true).float().mean().item()
        
        history["train_loss"].append(train_loss.item())
        history["val_loss"].append(val_loss)
        history["val_acc"].append(val_acc)
        
        if (epoch + 1) % 10 == 0:
            logger.info(f"Epoch {epoch+1:3d} | Train Loss: {train_loss.item():.4f} | "
                       f"Val Loss: {val_loss:.4f} | Val Acc: {val_acc:.4f}")
        
        # Early stopping
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            best_model_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= patience:
                logger.info(f"Early stopping at epoch {epoch+1}")
                break
    
    # Load best model
    if best_model_state is not None:
        model.load_state_dict(best_model_state)
        model = model.to(device)
    
    # Final evaluation
    model.eval()
    with torch.no_grad():
        logits, embeddings = model.predict(data.x_dict, data.edge_index_dict)
        val_pred = logits["account"][data["account"].val_mask].argmax(dim=1).cpu()
        val_true = data["account"].y[data["account"].val_mask].cpu()
        
        # Compute metrics
        tp = ((val_pred == 1) & (val_true == 1)).sum().item()
        fp = ((val_pred == 1) & (val_true == 0)).sum().item()
        fn = ((val_pred == 0) & (val_true == 1)).sum().item()
        tn = ((val_pred == 0) & (val_true == 0)).sum().item()
    
    metrics = {
        "best_val_loss": best_val_loss,
        "final_val_acc": (tp + tn) / (tp + fp + fn + tn) if (tp + fp + fn + tn) > 0 else 0,
        "precision": tp / (tp + fp) if (tp + fp) > 0 else 0,
        "recall": tp / (tp + fn) if (tp + fn) > 0 else 0,
        "f1": 2 * tp / (2 * tp + fp + fn) if (2 * tp + fp + fn) > 0 else 0,
        "epochs_trained": epoch + 1,
    }
    
    logger.info(f"\nGAT Training Results:")
    for k, v in metrics.items():
        logger.info(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")
    
    return model, metrics


def save_gat_model(model: HeteroGAT, metrics: dict, save_dir: str = "models/saved"):
    """Save trained GAT model and metrics."""
    os.makedirs(save_dir, exist_ok=True)
    torch.save({
        "model_state_dict": model.state_dict(),
        "metrics": metrics,
    }, os.path.join(save_dir, "gat_model.pt"))
    logger.info(f"Saved GAT model to {save_dir}/gat_model.pt")


def load_gat_model(
    in_channels: int,
    save_dir: str = "models/saved",
    device: str = "auto"
) -> Tuple[HeteroGAT, dict]:
    """Load trained GAT model."""
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    
    checkpoint = torch.load(
        os.path.join(save_dir, "gat_model.pt"),
        map_location=device,
        weights_only=False
    )
    
    model = HeteroGAT(in_channels=in_channels)
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()
    
    return model, checkpoint.get("metrics", {})
