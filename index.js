import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();
const required=["JWT_SECRET","ADMIN_PASSWORD_HASH"];
for(const k of required) if(!process.env[k]) { console.error(`Missing ${k} in .env`); process.exit(1); }
if(process.env.JWT_SECRET.length<32){console.error("JWT_SECRET must be at least 32 characters");process.exit(1)}
const app=express();
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const db=new Database(process.env.DB_FILE||path.join(__dirname,"coinbazar.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS packages(id TEXT PRIMARY KEY,service TEXT NOT NULL,name TEXT NOT NULL,price INTEGER NOT NULL CHECK(price>=0),active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(order_id TEXT PRIMARY KEY,customer TEXT NOT NULL,phone TEXT NOT NULL,account TEXT NOT NULL,package_id TEXT NOT NULL,service TEXT NOT NULL,package_name TEXT NOT NULL,price INTEGER NOT NULL,method TEXT NOT NULL,trx TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Pending',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,actor TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
`);
const seed=[
["coins100","TikTok Coins","100 Coins",290],["coins200","TikTok Coins","200 Coins",520],
["coins400","TikTok Coins","400 Coins",950],["coins1000","TikTok Coins","1000 Coins • Big Offer",1820],
["fbverify","Facebook Blue Tick","Meta Verified assistance",0],["fbboost","Facebook Boost","Custom package",0],
["igboost","Instagram Boost","Custom package",0],["ytboost","YouTube Boost","Custom package",0],["ttboost","TikTok Video Boost","Custom package",0]
];
const add=db.prepare("INSERT OR IGNORE INTO packages(id,service,name,price,active) VALUES(?,?,?,?,1)");
for(const p of seed)add.run(...p);
const setPay=db.prepare("INSERT OR IGNORE INTO payments(key,value) VALUES(?,?)");
setPay.run("bkash",process.env.PAY_BKASH||"01996942303");setPay.run("nagad",process.env.PAY_NAGAD||"01860323914");setPay.run("rocket",process.env.PAY_ROCKET||"01860323914");
app.disable("x-powered-by");
app.use(helmet({contentSecurityPolicy:false}));
const origins=(process.env.ALLOWED_ORIGINS||"").split(",").map(x=>x.trim()).filter(Boolean);
app.use(cors({origin:(origin,cb)=>{if(!origin||origins.includes(origin))return cb(null,true);cb(new Error("Origin not allowed"))}}));
app.use(express.json({limit:"30kb"}));
app.use("/api",rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:true,legacyHeaders:false}));
const adminLimiter=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:true,legacyHeaders:false});
const now=()=>new Date().toISOString();
const audit=(action,actor,details)=>db.prepare("INSERT INTO audit(action,actor,details,created_at) VALUES(?,?,?,?)").run(action,actor,JSON.stringify(details),now());
const packages=()=>db.prepare("SELECT id,service,name,price,active FROM packages ORDER BY rowid").all().map(x=>({...x,active:!!x.active}));
const paymentMap=()=>Object.fromEntries(db.prepare("SELECT key,value FROM payments").all().map(x=>[x.key,x.value]));
function auth(req,res,next){try{const h=req.headers.authorization||"";const token=h.startsWith("Bearer ")?h.slice(7):"";req.admin=jwt.verify(token,process.env.JWT_SECRET);next()}catch{return res.status(401).json({error:"Admin login required"})}}
const clean=(v,max=300)=>typeof v==="string"?v.trim().slice(0,max):"";
app.get("/api/health",(req,res)=>res.json({ok:true}));
app.get("/api/public",(req,res)=>res.json({packages:packages().filter(p=>p.active),payments:paymentMap()}));
app.post("/api/orders",(req,res)=>{
 const customer=clean(req.body.customer,100),phone=clean(req.body.phone,30),account=clean(req.body.account,500),packageId=clean(req.body.packageId,80),method=clean(req.body.method,20),trx=clean(req.body.trx,100);
 if(!customer||!phone||!account||!packageId||!trx||!["bKash","Nagad","Rocket"].includes(method))return res.status(400).json({error:"সব তথ্য সঠিকভাবে পূরণ করুন"});
 if(!/^[0-9+ -]{8,20}$/.test(phone))return res.status(400).json({error:"সঠিক মোবাইল নম্বর দিন"});
 const p=db.prepare("SELECT * FROM packages WHERE id=? AND active=1").get(packageId);if(!p)return res.status(400).json({error:"প্যাকেজটি পাওয়া যায়নি"});
 const orderId="CB"+crypto.randomBytes(4).toString("hex").toUpperCase();
 db.prepare("INSERT INTO orders(order_id,customer,phone,account,package_id,service,package_name,price,method,trx,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(orderId,customer,phone,account,p.id,p.service,p.name,p.price,method,trx,"Pending",now());
 audit("order_created","customer",{orderId,packageId,method});res.status(201).json({orderId});
});
app.get("/api/orders/lookup",(req,res)=>{
 const q=clean(req.query.q,100);if(q.length<5)return res.status(400).json({error:"অর্ডার ID বা মোবাইল নম্বর দিন"});
 const rows=db.prepare("SELECT order_id AS orderId,service,package_name AS packageName,price,status,created_at AS createdAt FROM orders WHERE order_id=? OR phone=? ORDER BY created_at DESC LIMIT 30").all(q,q);
 res.json({orders:rows});
});
app.post("/api/admin/login",adminLimiter,async(req,res)=>{
 const username=clean(req.body.username,80),password=typeof req.body.password==="string"?req.body.password:"";
 if(username!==(process.env.ADMIN_USERNAME||"admin")||!await bcrypt.compare(password,process.env.ADMIN_PASSWORD_HASH))return res.status(401).json({error:"Username অথবা password ভুল"});
 const token=jwt.sign({sub:"admin",role:"superadmin"},process.env.JWT_SECRET,{expiresIn:"2h"});audit("admin_login","admin",{});res.json({token,expiresIn:7200});
});
app.get("/api/admin/orders",auth,(req,res)=>res.json({orders:db.prepare("SELECT order_id AS orderId,customer,phone,account,service,package_name AS packageName,price,method,trx,status,created_at AS createdAt FROM orders ORDER BY created_at DESC LIMIT 300").all()}));
app.patch("/api/admin/orders/:id",auth,(req,res)=>{
 const status=clean(req.body.status,20);if(!["Approved","Rejected","Pending","Completed"].includes(status))return res.status(400).json({error:"Invalid status"});
 const info=db.prepare("UPDATE orders SET status=? WHERE order_id=?").run(status,clean(req.params.id,30));if(!info.changes)return res.status(404).json({error:"Order not found"});
 audit("order_status_changed","admin",{id:req.params.id,status});res.json({ok:true});
});
app.get("/api/admin/packages",auth,(req,res)=>res.json({packages:packages()}));
app.patch("/api/admin/packages/:id",auth,(req,res)=>{
 const id=clean(req.params.id,80),old=db.prepare("SELECT * FROM packages WHERE id=?").get(id);if(!old)return res.status(404).json({error:"Package not found"});
 const price=req.body.price===undefined?old.price:Number(req.body.price),active=req.body.active===undefined?!!old.active:!!req.body.active;
 if(!Number.isSafeInteger(price)||price<0||price>100000000)return res.status(400).json({error:"Invalid price"});
 db.prepare("UPDATE packages SET price=?,active=? WHERE id=?").run(price,active?1:0,id);audit("package_updated","admin",{id,price,active});res.json({ok:true});
});
app.put("/api/admin/payments",auth,(req,res)=>{
 const values={bkash:clean(req.body.bkash,30),nagad:clean(req.body.nagad,30),rocket:clean(req.body.rocket,30)};
 const st=db.prepare("INSERT INTO payments(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
 for(const [k,v] of Object.entries(values))st.run(k,v);audit("payment_config_updated","admin",{});res.json({ok:true});
});
app.use(express.static(path.join(__dirname,"../public"),{extensions:["html"]}));
app.use((err,req,res,next)=>{console.error(err.message);res.status(500).json({error:"Server error"})});
const port=Number(process.env.PORT||3000);app.listen(port,"0.0.0.0",()=>console.log(`CoinBazar server listening on :${port}`));
