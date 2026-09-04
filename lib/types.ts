export type ConstraintStrength = "HARD" | "SOFT";
export type ConstraintState = "PASS" | "UNKNOWN" | "FAIL";
export type EvidenceStatus =
  | "VERIFIED_CURRENT"
  | "VERIFIED_HISTORICAL"
  | "CONFLICTING"
  | "UNVERIFIED"
  | "UNKNOWN";
export type EvidenceClass =
  | "CURRENT_STATE"
  | "TIME_BOUNDED_CREDENTIAL"
  | "CURRENT_POLICY"
  | "HISTORICAL_EVENT";
export type ReasonProvenance = "OBSERVED" | "INFERRED" | "UNKNOWN";

export interface AccountingInput {
  merchandiseGrossPaise: number;
  buyerShippingChargePaise: number;
  outputGstRate: string;
  economicCogsPaise: number;
  fulfilmentCostPaise: number;
  processorPlatformRate: string;
  gatewayFeeGstRate: string;
  gatewayFeeGstRecoverable: boolean;
  otherVariableCostPaise?: number;
}

export interface AccountingResult {
  grossCustomerPayablePaise: number;
  outputTaxPaise: number;
  netSalesRevenuePaise: number;
  economicCogsPaise: number;
  fulfilmentCostPaise: number;
  processorCostPaise: number;
  otherVariableCostPaise: number;
  contributionPaise: number;
  contributionMargin: string;
}

export interface ConstraintEvaluation {
  key: string;
  label: string;
  strength: ConstraintStrength;
  state: ConstraintState;
  provenance: ReasonProvenance;
  detail: string;
}

export interface EvidenceFact {
  predicate: string;
  status: EvidenceStatus;
  evidenceClass: EvidenceClass;
  source: string;
  detail: string;
  validFrom?: string;
  validUntil?: string;
  scope?: string;
}

export interface DemoCandidate {
  id: string;
  label: string;
  description: string;
  buyerPasses: boolean;
  policyResult: "ALLOW" | "BLOCK" | "APPROVAL_REQUIRED";
  policyReason: string;
  accounting: AccountingResult;
  locationId: string;
  discountBps: number;
}

export interface DemoStep {
  id: string;
  event: string;
  title: string;
  detail: string;
  state: "success" | "warning" | "danger" | "neutral";
  timestamp: string;
}
