"""Descriptor-driven sequential fault simulator for the STT-MRAM BIST UI."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple


Location = Tuple[int, int]


def pattern_bit(pattern: str, bit: int) -> int:
    pattern = str(pattern)
    if pattern in {"0", "00"}:
        return 0
    if pattern in {"1", "11"}:
        return 1
    if pattern == "01":
        return bit & 1
    if pattern == "10":
        return 1 - (bit & 1)
    raise ValueError(f"Unsupported data pattern: {pattern}")


def load_descriptors(root: Path) -> List[Dict[str, Any]]:
    builtins = json.loads((root / "descriptors.json").read_text(encoding="utf-8"))
    custom_path = root / "user_descriptors.json"
    custom = json.loads(custom_path.read_text(encoding="utf-8")) if custom_path.exists() else []
    merged = {item["id"]: item for item in builtins}
    merged.update({item["id"]: item for item in custom})
    return list(merged.values())


def validate_descriptor(item: Dict[str, Any]) -> None:
    for key in ("id", "name", "roles", "relation"):
        if key not in item:
            raise ValueError(f"Descriptor is missing {key}")
    if not isinstance(item["roles"], list) or "VTM" not in item["roles"]:
        raise ValueError("Descriptor roles must include VTM")
    if item.get("supported", True) and not item.get("variants"):
        raise ValueError("A supported descriptor requires at least one variant")
    for variant in item.get("variants", []):
        if not variant.get("id") or "trigger" not in variant or "effect" not in variant:
            raise ValueError("Each variant requires id, trigger, and effect")


@dataclass(frozen=True)
class FaultInstance:
    descriptor_id: str
    variant: Dict[str, Any]
    roles: Dict[str, Location]

    @property
    def label(self) -> str:
        role_text = ", ".join(f"{name}=A{loc[0]}/B{loc[1]}" for name, loc in self.roles.items())
        return f"{self.variant['id']} · {role_text}"


def generate_role_maps(depth: int, width: int, relation: str) -> Iterable[Dict[str, Location]]:
    if relation == "single":
        for address in range(depth):
            for bit in range(width):
                yield {"VTM": (address, bit)}
        return
    if relation == "same_word_adjacent":
        for address in range(depth):
            for bit in range(width - 1):
                yield {"AGR": (address, bit), "VTM": (address, bit + 1)}
                yield {"AGR": (address, bit + 1), "VTM": (address, bit)}
        return
    if relation == "adjacent_address":
        for address in range(depth - 1):
            for bit in range(width):
                yield {"AGR": (address, bit), "VTM": (address + 1, bit)}
                yield {"AGR": (address + 1, bit), "VTM": (address, bit)}
        return
    raise ValueError(f"Unsupported address relation: {relation}")


def trigger_matches(trigger: Dict[str, Any], operation: str, target: str,
                    before: Dict[str, int], write_values: Dict[str, int]) -> bool:
    if trigger.get("operation") != operation or trigger.get("target", "VTM") != target:
        return False
    state = trigger.get("state", "*")
    if state != "*" and before[target] != int(state):
        return False
    transition = trigger.get("transition", "*")
    if transition != "*":
        if operation != "write":
            return False
        expected = f"{before[target]}->{write_values[target]}"
        if transition != expected:
            return False
    for role, required in trigger.get("requires", {}).items():
        if before.get(role) != int(required):
            return False
    return True


def apply_state_effect(states: Dict[str, int], target: str, action: str,
                       before: Dict[str, int]) -> None:
    if action in {None, "none"}:
        return
    if action == "hold":
        states[target] = before[target]
    elif action == "flip":
        states[target] = 1 - states[target]
    elif action == "force0":
        states[target] = 0
    elif action == "force1":
        states[target] = 1
    else:
        raise ValueError(f"Unsupported state effect: {action}")


def alter_output(value: int, action: str | None) -> int:
    if action in {None, "stored"}:
        return value
    if action == "invert":
        return 1 - value
    if action == "force0":
        return 0
    if action == "force1":
        return 1
    raise ValueError(f"Unsupported read output effect: {action}")


def simulate_instance(instance: FaultInstance, elements: List[Dict[str, Any]]) -> Dict[str, Any]:
    roles = instance.roles
    variant = instance.variant
    trigger = variant["trigger"]
    effect = variant["effect"]
    golden = {role: 0 for role in roles}
    faulty = dict(golden)
    if "initial_state" in variant:
        faulty[effect.get("target", "VTM")] = int(variant["initial_state"])
    repeat_needed = max(1, int(trigger.get("repeat", 1)))
    repeat_count = 0
    activated = False
    golden_errors = 0
    global_step = 0

    addresses = sorted({location[0] for location in roles.values()})
    roles_at_address: Dict[int, List[str]] = {}
    for role, location in roles.items():
        roles_at_address.setdefault(location[0], []).append(role)

    for element_index, element in enumerate(elements):
        direction = element.get("direction", "up")
        ordered_addresses = list(reversed(addresses)) if direction == "down" else addresses
        for address in ordered_addresses:
            local_roles = roles_at_address[address]
            for operation_index, operation in enumerate(element.get("operations", [])):
                global_step += 1
                kind = operation["kind"]
                pattern = str(operation.get("pattern", "0"))
                before = dict(faulty)
                write_values = {
                    role: pattern_bit(pattern, roles[role][1])
                    for role in roles
                }
                target = trigger.get("target", "VTM")
                target_is_local = target in local_roles
                matched = target_is_local and trigger_matches(
                    trigger, "write" if kind == "w" else "read" if kind == "r" else "idle",
                    target, before, write_values
                )

                if matched:
                    repeat_count += 1
                else:
                    repeat_count = 0
                fires = matched and repeat_count >= repeat_needed

                if kind == "w":
                    for role in local_roles:
                        golden[role] = write_values[role]
                        faulty[role] = write_values[role]
                    if fires:
                        activated = True
                        apply_state_effect(faulty, effect.get("target", "VTM"), effect.get("state"), before)
                    continue

                if kind == "idle":
                    if fires:
                        activated = True
                        apply_state_effect(faulty, effect.get("target", "VTM"), effect.get("state"), before)
                    continue

                if kind != "r":
                    raise ValueError(f"Unsupported operation kind: {kind}")

                faulty_outputs = {role: faulty[role] for role in local_roles}
                golden_outputs = {role: golden[role] for role in local_roles}
                for role in local_roles:
                    if golden_outputs[role] != write_values[role]:
                        golden_errors += 1
                if fires:
                    activated = True
                    output_target = effect.get("target", "VTM")
                    if output_target in faulty_outputs:
                        faulty_outputs[output_target] = alter_output(
                            faulty_outputs[output_target], effect.get("read_output")
                        )

                for role in local_roles:
                    if faulty_outputs[role] != golden_outputs[role]:
                        return {
                            "detected": True,
                            "activated": activated,
                            "golden_errors": golden_errors,
                            "witness": {
                                "instance": instance.label,
                                "element": f"M{element_index}",
                                "operation_index": operation_index,
                                "global_projected_step": global_step,
                                "address": address,
                                "bit": roles[role][1],
                                "role": role,
                                "operation": f"r{pattern}",
                                "golden_output": golden_outputs[role],
                                "faulty_output": faulty_outputs[role]
                            }
                        }

                if fires:
                    apply_state_effect(faulty, effect.get("target", "VTM"), effect.get("state"), before)

    return {"detected": False, "activated": activated, "golden_errors": golden_errors, "witness": None}


def simulate_descriptor(descriptor: Dict[str, Any], depth: int, width: int,
                        elements: List[Dict[str, Any]], relation_override: str | None,
                        max_instances: int) -> Dict[str, Any]:
    if not descriptor.get("supported", True):
        return {
            "id": descriptor["id"], "name": descriptor["name"], "status": "unsupported",
            "reason": descriptor.get("unsupported_reason", "Descriptor is not executable."),
            "injected": 0, "detected": 0, "undetected": 0, "coverage": None
        }

    relation = relation_override if descriptor.get("relation") != "single" and relation_override else descriptor["relation"]
    variants = descriptor.get("variants", [])
    role_maps = list(generate_role_maps(depth, width, relation))
    total = len(role_maps) * len(variants)
    if total > max_instances:
        return {
            "id": descriptor["id"], "name": descriptor["name"], "status": "limit",
            "reason": f"{total:,} instances exceed the configured limit of {max_instances:,}.",
            "injected": total, "detected": 0, "undetected": total, "coverage": None
        }

    detected = 0
    activated = 0
    golden_errors = 0
    first_witness = None
    undetected_examples: List[str] = []
    for variant in variants:
        for roles in role_maps:
            instance = FaultInstance(descriptor["id"], variant, roles)
            result = simulate_instance(instance, elements)
            if result["activated"]:
                activated += 1
            golden_errors += result["golden_errors"]
            if result["detected"]:
                detected += 1
                if first_witness is None:
                    first_witness = result["witness"]
            elif len(undetected_examples) < 5:
                undetected_examples.append(instance.label)
    return {
        "id": descriptor["id"], "name": descriptor["name"], "status": "complete",
        "relation": relation, "injected": total, "activated": activated,
        "detected": detected, "undetected": total - detected,
        "coverage": round((detected / total * 100.0), 6) if total else None,
        "first_detection": first_witness, "undetected_examples": undetected_examples,
        "golden_sequence_mismatches": golden_errors
    }


def run_simulation(request: Dict[str, Any], descriptors: List[Dict[str, Any]]) -> Dict[str, Any]:
    started = time.perf_counter()
    memory = request.get("memory", {})
    depth = int(memory.get("depth", 0))
    width = int(memory.get("dataWidth", 0))
    if not 2 <= depth <= 65536:
        raise ValueError("Memory depth must be between 2 and 65536")
    if not 2 <= width <= 1024:
        raise ValueError("Data width must be between 2 and 1024")
    elements = request.get("sequence", [])
    if not elements:
        raise ValueError("At least one sequence element is required")
    max_instances = int(request.get("maxInstances", 250000))
    selected_order = request.get("faults") or [item["id"] for item in descriptors]
    descriptor_by_id = {item["id"]: item for item in descriptors}
    relation = request.get("couplingRelation", "same_word_adjacent")

    results = []
    for descriptor_id in selected_order:
        descriptor = descriptor_by_id.get(descriptor_id)
        if descriptor is None:
            raise ValueError(f"Unknown fault descriptor: {descriptor_id}")
        validate_descriptor(descriptor)
        results.append(simulate_descriptor(
            descriptor, depth, width, elements, relation, max_instances
        ))

    injected = sum(item["injected"] for item in results if item["status"] == "complete")
    detected = sum(item["detected"] for item in results if item["status"] == "complete")
    return {
        "schema": "sttmram-fault-coverage/v1",
        "memory": {"depth": depth, "dataWidth": width},
        "algorithm": request.get("algorithm", "Custom sequence"),
        "operationComplexity": request.get("operationComplexity"),
        "couplingRelation": relation,
        "models": results,
        "summary": {
            "injected": injected,
            "detected": detected,
            "undetected": injected - detected,
            "weightedCoverage": round(detected / injected * 100.0, 6) if injected else None,
            "executableModels": sum(item["status"] == "complete" for item in results),
            "unsupportedModels": sum(item["status"] != "complete" for item in results)
        },
        "elapsedSeconds": round(time.perf_counter() - started, 6)
    }
