import pytest

from pipeline import bin as binning
from pipeline import config, load

SAMPLE_AREAS = {"sample_box": {"name": "Sample box (SYNTHETIC)", "bbox": [100.0, 0.0, 102.0, 2.0]}}


@pytest.fixture(scope="session")
def sample_loaded():
    """Cleaned + raw frames from the synthetic files in data/sample/."""
    return load.load_all(config.SAMPLE_DIR)


@pytest.fixture(scope="session")
def sample_counts(sample_loaded):
    cleaned, _ = sample_loaded
    return binning.monthly_counts(cleaned, SAMPLE_AREAS)
