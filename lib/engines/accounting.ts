import Decimal from "decimal.js";
import type { AccountingInput, AccountingResult } from "@/lib/types";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

function money(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

function rate(value: string): Decimal {
  return new Decimal(value);
}

export function calculateAccounting(input: AccountingInput): AccountingResult {
  const gross = money(input.merchandiseGrossPaise).plus(money(input.buyerShippingChargePaise));
  const gstRate = rate(input.outputGstRate);
  const netRevenue = money(gross.div(new Decimal(1).plus(gstRate)));
  const outputTax = gross.minus(netRevenue);

  const platformFee = money(gross.mul(rate(input.processorPlatformRate)));
  const platformFeeTax = money(platformFee.mul(rate(input.gatewayFeeGstRate)));
  const processor = input.gatewayFeeGstRecoverable ? platformFee : platformFee.plus(platformFeeTax);

  const cogs = money(input.economicCogsPaise);
  const fulfilment = money(input.fulfilmentCostPaise);
  const other = money(input.otherVariableCostPaise ?? 0);
  const contribution = netRevenue.minus(cogs).minus(fulfilment).minus(processor).minus(other);
  const margin = netRevenue.eq(0) ? new Decimal(0) : contribution.div(netRevenue);

  return {
    grossCustomerPayablePaise: gross.toNumber(),
    outputTaxPaise: outputTax.toNumber(),
    netSalesRevenuePaise: netRevenue.toNumber(),
    economicCogsPaise: cogs.toNumber(),
    fulfilmentCostPaise: fulfilment.toNumber(),
    processorCostPaise: processor.toNumber(),
    otherVariableCostPaise: other.toNumber(),
    contributionPaise: contribution.toNumber(),
    contributionMargin: margin.toDecimalPlaces(6).toString()
  };
}

export function applyDiscount(grossMerchandisePaise: number, discountBps: number): number {
  const multiplier = new Decimal(1).minus(new Decimal(discountBps).div(10_000));
  return money(new Decimal(grossMerchandisePaise).mul(multiplier)).toNumber();
}

export function minimumDiscountBpsToMeetBudget(
  merchandiseGrossPaise: number,
  buyerShippingChargePaise: number,
  buyerBudgetGrossPaise: number
): number {
  const maxMerchandise = new Decimal(buyerBudgetGrossPaise).minus(buyerShippingChargePaise);
  if (maxMerchandise.greaterThanOrEqualTo(merchandiseGrossPaise)) return 0;
  const discount = new Decimal(1).minus(maxMerchandise.div(merchandiseGrossPaise));
  return discount.mul(10_000).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

export function compareMargin(actual: string, floor: string): boolean {
  return new Decimal(actual).greaterThanOrEqualTo(new Decimal(floor));
}

export function formatINR(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(paise / 100);
}

export function percent(decimalString: string): string {
  return `${new Decimal(decimalString).mul(100).toDecimalPlaces(2).toString()}%`;
}

export function calculateRealizedContribution(input: {
  grossCustomerPayablePaise: number;
  outputGstRate: string;
  economicCogsPaise: number;
  fulfilmentCostPaise: number;
  processorFeeIncludingTaxPaise: number;
  processorTaxPaise: number;
  gatewayFeeGstRecoverable: boolean;
  otherVariableCostPaise?: number;
}): AccountingResult {
  const gross = money(input.grossCustomerPayablePaise);
  const gstRate = rate(input.outputGstRate);
  const netRevenue = money(gross.div(new Decimal(1).plus(gstRate)));
  const outputTax = gross.minus(netRevenue);
  const reportedFee = money(input.processorFeeIncludingTaxPaise);
  const reportedTax = money(input.processorTaxPaise);
  const processor = input.gatewayFeeGstRecoverable ? reportedFee.minus(reportedTax) : reportedFee;
  const cogs = money(input.economicCogsPaise);
  const fulfilment = money(input.fulfilmentCostPaise);
  const other = money(input.otherVariableCostPaise ?? 0);
  const contribution = netRevenue.minus(cogs).minus(fulfilment).minus(processor).minus(other);
  const margin = netRevenue.eq(0) ? new Decimal(0) : contribution.div(netRevenue);
  return {
    grossCustomerPayablePaise: gross.toNumber(),
    outputTaxPaise: outputTax.toNumber(),
    netSalesRevenuePaise: netRevenue.toNumber(),
    economicCogsPaise: cogs.toNumber(),
    fulfilmentCostPaise: fulfilment.toNumber(),
    processorCostPaise: processor.toNumber(),
    otherVariableCostPaise: other.toNumber(),
    contributionPaise: contribution.toNumber(),
    contributionMargin: margin.toDecimalPlaces(6).toString()
  };
}
