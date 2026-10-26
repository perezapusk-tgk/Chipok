import { Pool, PoolClient } from "pg";

const rawConnectionString=process.env.DATABASE_URL;
const connectionString=rawConnectionString?.replace(
  /([?&]sslmode=)(prefer|require|verify-ca)(?=(&|$))/i,
  "$1verify-full"
);

export const pool=new Pool({connectionString});

export async function withTransaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{
 const c=await pool.connect();
 try{
  await c.query("BEGIN");
  const r=await fn(c);
  await c.query("COMMIT");
  return r;
 }catch(e){
  await c.query("ROLLBACK");
  throw e
 }finally{c.release()}
}
