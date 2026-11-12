import json
import unittest
from pathlib import Path

from local_engine.simulator import load_descriptors, run_simulation


ROOT = Path(__file__).resolve().parent


MARCH_C_MINUS = [
    {"direction": "up", "operations": [{"kind": "w", "pattern": "0"}]},
    {"direction": "up", "operations": [{"kind": "r", "pattern": "0"}, {"kind": "w", "pattern": "1"}]},
    {"direction": "up", "operations": [{"kind": "r", "pattern": "1"}, {"kind": "w", "pattern": "0"}]},
    {"direction": "down", "operations": [{"kind": "r", "pattern": "0"}, {"kind": "w", "pattern": "1"}]},
    {"direction": "down", "operations": [{"kind": "r", "pattern": "1"}, {"kind": "w", "pattern": "0"}]},
    {"direction": "up", "operations": [{"kind": "r", "pattern": "0"}]},
]


class SimulatorTests(unittest.TestCase):
    def request(self, faults, sequence=MARCH_C_MINUS):
        return {
            "memory": {"depth": 4, "dataWidth": 2},
            "algorithm": "March C- test",
            "sequence": sequence,
            "faults": faults,
            "couplingRelation": "same_word_adjacent",
            "maxInstances": 10000,
        }

    def test_march_c_detects_saf_and_tf(self):
        result = run_simulation(self.request(["SAF", "TF"]), load_descriptors(ROOT))
        models = {item["id"]: item for item in result["models"]}
        self.assertEqual(models["SAF"]["coverage"], 100.0)
        self.assertEqual(models["TF"]["coverage"], 100.0)
        self.assertIsNotNone(models["TF"]["first_detection"])

    def test_dynamic_fault_needs_four_reads(self):
        no_repeat = run_simulation(self.request(["dIRF"]), load_descriptors(ROOT))
        self.assertEqual(no_repeat["models"][0]["coverage"], 0.0)
        repeated = [
            {"direction": "up", "operations": [
                {"kind": "w", "pattern": "0"},
                {"kind": "r", "pattern": "0"},
                {"kind": "r", "pattern": "0"},
                {"kind": "r", "pattern": "0"},
                {"kind": "r", "pattern": "0"},
            ]},
            {"direction": "up", "operations": [
                {"kind": "w", "pattern": "1"},
                {"kind": "r", "pattern": "1"},
                {"kind": "r", "pattern": "1"},
                {"kind": "r", "pattern": "1"},
                {"kind": "r", "pattern": "1"},
            ]},
        ]
        yes_repeat = run_simulation(self.request(["dIRF"], repeated), load_descriptors(ROOT))
        self.assertEqual(yes_repeat["models"][0]["coverage"], 100.0)

    def test_transient_without_occurrence_model_is_not_claimed(self):
        result = run_simulation(self.request(["TRDF", "TWF"]), load_descriptors(ROOT))
        self.assertTrue(all(item["status"] == "unsupported" for item in result["models"]))
        self.assertIsNone(result["summary"]["weightedCoverage"])


if __name__ == "__main__":
    unittest.main()
