import { createHash } from "node:crypto";
import postgres, { type Sql } from "postgres";

type SnapshotRow={snapshot:Uint8Array;version:number|string;checksum:string;updated_at:string};
const globalStore=globalThis as unknown as {razorProcureSql?:Sql;razorProcureSchemaReady?:Promise<void>};

export function postgresSnapshotConfigured(){return Boolean(process.env.POSTGRES_URL?.startsWith("postgresql://"))}

function client(){
  if(!process.env.POSTGRES_URL)throw new Error("POSTGRES_URL_NOT_CONFIGURED");
  // Supabase's transaction-mode pooler is the IPv4-compatible endpoint for
  // serverless runtimes. Prepared statements are intentionally disabled
  // because transaction pooling cannot retain session-level statement state.
  globalStore.razorProcureSql??=postgres(process.env.POSTGRES_URL,{ssl:"require",max:1,idle_timeout:20,connect_timeout:10,prepare:false});
  return globalStore.razorProcureSql;
}

async function ensureSchema(){
  if(!globalStore.razorProcureSchemaReady){
    globalStore.razorProcureSchemaReady=(async()=>{
      const sql=client();
      await sql`CREATE TABLE IF NOT EXISTS razorprocure_state_snapshots (
        workspace_id TEXT PRIMARY KEY,
        snapshot BYTEA NOT NULL,
        version BIGINT NOT NULL CHECK(version > 0),
        checksum TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
    })();
  }
  await globalStore.razorProcureSchemaReady;
}

function checksum(snapshot:Uint8Array){return createHash("sha256").update(snapshot).digest("hex")}

export async function loadDurableSnapshot(workspaceId="aster-retail"){
  await ensureSchema();const sql=client();
  const rows=await sql<SnapshotRow[]>`SELECT snapshot,version,checksum,updated_at::text FROM razorprocure_state_snapshots WHERE workspace_id=${workspaceId}`;
  const row=rows[0];if(!row)return null;
  const snapshot=Buffer.from(row.snapshot);
  if(checksum(snapshot)!==row.checksum)throw new Error("DURABLE_SNAPSHOT_CHECKSUM_MISMATCH");
  return {snapshot,version:Number(row.version),checksum:row.checksum,updatedAt:row.updated_at};
}

export async function saveDurableSnapshot(snapshot:Uint8Array,expectedVersion:number,workspaceId="aster-retail"){
  await ensureSchema();const sql=client();const digest=checksum(snapshot);const nextVersion=expectedVersion+1;
  const rows=await sql<{version:number|string}[]>`
    INSERT INTO razorprocure_state_snapshots(workspace_id,snapshot,version,checksum,updated_at)
    VALUES(${workspaceId},${snapshot},${nextVersion},${digest},NOW())
    ON CONFLICT(workspace_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,version=razorprocure_state_snapshots.version+1,checksum=EXCLUDED.checksum,updated_at=NOW()
    WHERE razorprocure_state_snapshots.version=${expectedVersion}
    RETURNING version`;
  if(!rows[0])throw new Error("DURABLE_SNAPSHOT_VERSION_CONFLICT");
  return Number(rows[0].version);
}

export async function replaceDurableSnapshot(snapshot:Uint8Array,workspaceId="aster-retail"){
  await ensureSchema();const sql=client();const digest=checksum(snapshot);
  const rows=await sql<{version:number|string}[]>`
    INSERT INTO razorprocure_state_snapshots(workspace_id,snapshot,version,checksum,updated_at)
    VALUES(${workspaceId},${snapshot},1,${digest},NOW())
    ON CONFLICT(workspace_id) DO UPDATE SET snapshot=EXCLUDED.snapshot,version=razorprocure_state_snapshots.version+1,checksum=EXCLUDED.checksum,updated_at=NOW()
    RETURNING version`;
  return Number(rows[0].version);
}

export async function closeSnapshotConnection(){if(globalStore.razorProcureSql){await globalStore.razorProcureSql.end({timeout:5});delete globalStore.razorProcureSql;delete globalStore.razorProcureSchemaReady}}
