import unittest
from pathlib import Path

from local_engine.simulator import load_descriptors
from local_engine.synthesizer import count_n, synthesize


ROOT = Path(__file__).resolve().parent


class SynthesizerTests(unittest.TestCase):
    def test_budget_is_exact_from_one_to_one_hundred(self):
        descriptors = load_descriptors(ROOT)
        for budget in (1, 10, 26, 100):
            result = synthesize({
                "budgetN": budget,
                "attempts": 20,
                "faults": ["SAF", "TF"],
                "seed": 7,
            }, descriptors)
            self.assertTrue(result["candidates"])
            self.assertTrue(all(count_n(candidate["elements"]) == budget for candidate in result["candidates"]))

    def test_ten_n_search_can_recover_full_saf_tf_coverage(self):
        result = synthesize({
            "budgetN": 10,
            "attempts": 20,
            "faults": ["SAF", "TF"],
        }, load_descriptors(ROOT))
        best = result["candidates"][0]
        self.assertEqual(best["usedN"], 10)
        self.assertEqual(best["coverages"]["SAF"], 100.0)
        self.assertEqual(best["coverages"]["TF"], 100.0)
        self.assertEqual(result["faultPriority"], ["SAF", "TF"])


if __name__ == "__main__":
    unittest.main()
