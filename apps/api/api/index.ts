import { app, bootstrap } from "../src/server.js";

export default async function handler(req:any,res:any){
  await bootstrap();
  await app.ready();
  app.server.emit("request",req,res);
}
