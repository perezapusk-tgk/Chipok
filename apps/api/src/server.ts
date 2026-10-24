import Fastify from "fastify";
import cors from "@fastify/cors";
const app=Fastify({logger:true});
await app.register(cors,{origin:true});
app.get("/health",async()=>({ok:true,service:"chipok-api",version:"0.1.0"}));
app.get("/api/catalog",async()=>({items:[],nextCursor:null}));
app.listen({host:"0.0.0.0",port:Number(process.env.PORT||3001)});