import type { ConstraintEvaluation, EvidenceFact } from "@/lib/types";

export function hardEvidenceConstraint(label: string, key: string, fact: EvidenceFact | null): ConstraintEvaluation {
  if (!fact || fact.status === "UNKNOWN" || fact.status === "UNVERIFIED" || fact.status === "VERIFIED_HISTORICAL") {
    return {
      key,
      label,
      strength: "HARD",
      state: "UNKNOWN",
      provenance: fact ? "OBSERVED" : "UNKNOWN",
      detail: fact?.detail ?? "No acceptable current authority was found."
    };
  }
  if (fact.status === "CONFLICTING") {
    return {
      key,
      label,
      strength: "HARD",
      state: "FAIL",
      provenance: "OBSERVED",
      detail: "Current authorities conflict; commerce action is blocked."
    };
  }
  return {
    key,
    label,
    strength: "HARD",
    state: "PASS",
    provenance: "OBSERVED",
    detail: fact.detail
  };
}

export function hardBooleanConstraint(label: string, key: string, pass: boolean, detail: string): ConstraintEvaluation {
  return {
    key,
    label,
    strength: "HARD",
    state: pass ? "PASS" : "FAIL",
    provenance: "OBSERVED",
    detail
  };
}

export function softEvidenceConstraint(label: string, key: string, fact: EvidenceFact | null): ConstraintEvaluation {
  if (!fact || fact.status === "UNKNOWN" || fact.status === "UNVERIFIED" || fact.status === "VERIFIED_HISTORICAL") {
    return { key, label, strength: "SOFT", state: "UNKNOWN", provenance: fact ? "OBSERVED" : "UNKNOWN", detail: fact?.detail ?? "No acceptable current authority was found; candidate remains eligible but this preference is not presented as satisfied." };
  }
  if (fact.status === "CONFLICTING") {
    return { key, label, strength: "SOFT", state: "FAIL", provenance: "OBSERVED", detail: "Current authorities conflict; preference receives a ranking penalty." };
  }
  return { key, label, strength: "SOFT", state: "PASS", provenance: "OBSERVED", detail: fact.detail };
}

export function canProceed(constraints: ConstraintEvaluation[]): boolean {
  return constraints.filter((c) => c.strength === "HARD").every((c) => c.state === "PASS");
}
