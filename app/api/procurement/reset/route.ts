import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/security";
import { db } from "@/lib/db";
import { PROCUREMENT } from "@/lib/procurementConfig";

export async function POST(request:Request){
  try{
    enforceSameOrigin(request); await requireApiSession();
    db.transaction(()=>{
      db.prepare(`DELETE FROM procurement_receipts`).run();
      db.prepare(`DELETE FROM procurement_orders`).run();
      db.prepare(`DELETE FROM supplier_reservations`).run();
      db.prepare(`DELETE FROM procurement_run_options`).run();
      db.prepare(`DELETE FROM procurement_runs`).run();
      db.prepare(`UPDATE supplier_listings SET reserved_cases=0`).run();
      for(const l of PROCUREMENT.listings)db.prepare(`UPDATE supplier_listings SET available_cases=? WHERE id=?`).run(l.availableCases,`${l.supplierId}__${l.productKey}`);
    })();
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Reset failed."},{status:400});}
}
