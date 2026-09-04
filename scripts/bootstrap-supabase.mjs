import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";

function loadEnv(path){
  try{for(const line of readFileSync(path,"utf8").split(/\r?\n/)){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2].trim().replace(/^["']|["']$/g,"")}}catch{}
}

loadEnv(resolve(process.cwd(),".env.local"));
if(!process.env.POSTGRES_URL)throw new Error("POSTGRES_URL is missing from .env.local");
const configured=process.env.DATABASE_URL?.startsWith("file:")?process.env.DATABASE_URL.slice(5):".data/razorprocure.db";
const database=new Database(resolve(process.cwd(),configured),{readonly:true});
const snapshot=database.serialize();database.close();
const {replaceDurableSnapshot,loadDurableSnapshot,closeSnapshotConnection}=await import("../lib/postgresSnapshot.ts");
const version=await replaceDurableSnapshot(snapshot);
const verified=await loadDurableSnapshot();
if(!verified||verified.version!==version||verified.snapshot.length!==snapshot.length)throw new Error("Supabase snapshot verification failed");
console.log(`Supabase durable state ready (version ${version}, ${snapshot.length} bytes, checksum verified).`);
await closeSnapshotConnection();
