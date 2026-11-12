"""Heuristic custom March synthesis under a user-selected N budget."""

from __future__ import annotations

import json
import random
import time
from typing import Any, Dict, Iterable, List, Tuple

try:
    from local_engine.simulator import run_simulation
except ModuleNotFoundError:  # direct execution through local_engine/server.py
    from simulator import run_simulation


PATTERNS = ("0", "1", "01", "10")


def count_n(elements: List[Dict[str, Any]]) -> int:
    return sum(len(element.get("operations", [])) for element in elements)


def clone_elements(elements: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return json.loads(json.dumps(elements))


def pad_to_budget(elements: List[Dict[str, Any]], budget: int, final_pattern: str) -> List[Dict[str, Any]]:
    result = clone_elements(elements)
    remaining = budget - count_n(result)
    direction = "down" if len(result) % 2 else "up"
    while remaining > 0:
        chunk = min(remaining, 15)
        result.append({
            "direction": direction,
            "operations": [{"kind": "r", "pattern": final_pattern} for _ in range(chunk)]
        })
        direction = "up" if direction == "down" else "down"
        remaining -= chunk
    return result


MARCH_C_MINUS = [
    {"direction": "up", "operations": [{"kind": "w", "pattern": "0"}]},
    {"direction": "up", "operations": [{"kind": "r", "pattern": "0"}, {"kind": "w", "pattern": "1"}]},
    {"direction": "up", "operations": [{"kind": "r", "pattern": "1"}, {"kind": "w", "pattern": "0"}]},
    {"direction": "down", "operations": [{"kind": "r", "pattern": "0"}, {"kind": "w", "pattern": "1"}]},
    {"direction": "down", "operations": [{"kind": "r", "pattern": "1"}, {"kind": "w", "pattern": "0"}]},
    {"direction": "up", "operations": [{"kind": "r", "pattern": "0"}]},
]


DIRF_14 = [
    {"direction": "up", "operations": [{"kind": "w", "pattern": "0"}]},
    {"direction": "up", "operations": [{"kind": "r", "pattern": "0"}, {"kind": "w", "pattern": "1"}, *[{"kind": "r", "pattern": "1"} for _ in range(4)]]},
    {"direction": "down", "operations": [{"kind": "r", "pattern": "1"}, {"kind": "w", "pattern": "0"}, *[{"kind": "r", "pattern": "0"} for _ in range(4)]]},
    {"direction": "down", "operations": [{"kind": "r", "pattern": "0"}]},
]


def seeded_candidates(budget: int) -> Iterable[Tuple[str, List[Dict[str, Any]]]]:
    if budget >= 10:
        yield "March C− seed", pad_to_budget(MARCH_C_MINUS, budget, "0")
    if budget >= 14:
        yield "dIRF seed", pad_to_budget(DIRF_14, budget, "0")
    if budget >= 24:
        combined = clone_elements(MARCH_C_MINUS) + clone_elements(DIRF_14)
        yield "March C− + dIRF seed", pad_to_budget(combined, budget, "0")


def random_candidate(budget: int, rng: random.Random) -> List[Dict[str, Any]]:
    initial = rng.choice(PATTERNS)
    elements = [{"direction": rng.choice(("up", "down")), "operations": [{"kind": "w", "pattern": initial}]}]
    current = initial
    remaining = budget - 1
    while remaining > 0:
        direction = rng.choice(("up", "down"))
        choices: List[Tuple[List[Dict[str, str]], str]] = [
            ([{"kind": "r", "pattern": current}], current),
        ]
        for target in PATTERNS:
            if target == current:
                continue
            choices.append(([{"kind": "w", "pattern": target}, {"kind": "r", "pattern": target}], target))
            choices.append(([{"kind": "r", "pattern": current}, {"kind": "w", "pattern": target}, {"kind": "r", "pattern": target}], target))
            choices.append(([{"kind": "r", "pattern": current}, {"kind": "w", "pattern": target}, *[{"kind": "r", "pattern": target} for _ in range(4)]], target))
        choices.append((([{"kind": "r", "pattern": current} for _ in range(4)]), current))
        viable = [choice for choice in choices if len(choice[0]) <= remaining]
        if not viable:
            chunk = min(remaining, 15)
            operations = [{"kind": "r", "pattern": current} for _ in range(chunk)]
            next_pattern = current
        else:
            operations, next_pattern = rng.choice(viable)
        elements.append({"direction": direction, "operations": operations})
        current = next_pattern
        remaining -= len(operations)
    return elements


def signature(elements: List[Dict[str, Any]]) -> str:
    return json.dumps(elements, sort_keys=True, separators=(",", ":"))


def evaluate_candidate(elements: List[Dict[str, Any]], faults: List[str],
                       descriptors: List[Dict[str, Any]]) -> Dict[str, Any]:
    result = run_simulation({
        "memory": {"depth": 4, "dataWidth": 2},
        "algorithm": "Custom March search candidate",
        "operationComplexity": f"{count_n(elements)}N",
        "sequence": elements,
        "faults": faults,
        "couplingRelation": "same_word_adjacent",
        "maxInstances": 10000,
    }, descriptors)
    weighted_sum = 0.0
    weight_total = 0.0
    detected_models = 0
    coverages: Dict[str, float | None] = {}
    fault_count = len(faults)
    for index, model in enumerate(result["models"]):
        coverage = model.get("coverage")
        coverages[model["id"]] = coverage
        if coverage is None:
            continue
        weight = float(fault_count - index)
        weighted_sum += float(coverage) * weight
        weight_total += weight
        if coverage > 0:
            detected_models += 1
    return {
        "score": round(weighted_sum / weight_total, 6) if weight_total else 0.0,
        "detectedModels": detected_models,
        "coverages": coverages,
        "canonicalSummary": result["summary"],
    }


def synthesize(request: Dict[str, Any], descriptors: List[Dict[str, Any]]) -> Dict[str, Any]:
    started = time.perf_counter()
    budget = int(request.get("budgetN", 0))
    attempts = int(request.get("attempts", 200))
    if not 1 <= budget <= 100:
        raise ValueError("Custom March N must be between 1 and 100")
    if not 20 <= attempts <= 1000:
        raise ValueError("Search attempts must be between 20 and 1000")
    descriptor_ids = {item["id"] for item in descriptors}
    faults = [fault for fault in request.get("faults", []) if fault in descriptor_ids]
    if not faults:
        raise ValueError("Select at least one fault descriptor")

    rng = random.Random(int(request.get("seed", 611130)) + budget * 1009 + attempts)
    candidates: List[Tuple[str, List[Dict[str, Any]]]] = list(seeded_candidates(budget))
    candidates.extend((f"Generated {index + 1}", random_candidate(budget, rng)) for index in range(attempts))
    seen = set()
    ranked = []
    for origin, elements in candidates:
        key = signature(elements)
        if key in seen:
            continue
        seen.add(key)
        evaluation = evaluate_candidate(elements, faults, descriptors)
        ranked.append({
            "name": origin,
            "usedN": count_n(elements),
            "elements": elements,
            **evaluation,
        })
    ranked.sort(key=lambda item: (item["score"], item["detectedModels"], -len(item["elements"])), reverse=True)
    top = ranked[:5]
    for index, candidate in enumerate(top, 1):
        candidate["rank"] = index
        candidate["name"] = f"Custom March {budget}N · Candidate {index}"
    return {
        "schema": "sttmram-march-synthesis/v1",
        "budgetN": budget,
        "attempts": attempts,
        "canonicalMemory": {"depth": 4, "dataWidth": 2},
        "faultPriority": faults,
        "candidates": top,
        "evaluatedCandidates": len(ranked),
        "elapsedSeconds": round(time.perf_counter() - started, 6),
        "note": "Search score is computed on a 4x2 canonical memory. Validate the selected candidate again with the configured datasheet geometry."
    }
