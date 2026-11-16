# CoinBazar — Server-connected starter

এই প্যাকেজে একটি responsive PWA frontend এবং Node.js + SQLite API backend আছে। এটি ডেপ্লয় করার মতো starter code; production-ready audited payment platform নয়।

## 1) Server চালু
প্রয়োজন: Node.js 20+ এবং npm।
```bash
cd server
npm install
cp .env.example .env
```
একটি random JWT secret তৈরি করুন:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Admin password hash তৈরি করুন (কমপক্ষে ১২ অক্ষর):
```bash
npm run hash-password -- "নিজের-শক্তিশালী-পাসওয়ার্ড"
```
`.env` ফাইলে `JWT_SECRET` এবং `ADMIN_PASSWORD_HASH` বসান। `.env` কাউকে দেবেন না, ZIP বা Git-এ আপলোড করবেন না।
```bash
npm start
```
তারপর browser-এ `http://localhost:3000` খুলুন। প্রথমবার SQLite database ও demo package স্বয়ংক্রিয়ভাবে তৈরি হবে।

## 2) Admin
Username ডিফল্ট `admin`; password আপনি নিজে `.env`-এ hash হিসেবে সেট করবেন। Admin Panel-এ অর্ডার দেখা, status বদলানো, প্যাকেজ price enable/disable, payment নম্বর পরিবর্তন করা যায়।

## 3) Android
এটি PWA; HTTPS hosting-এ deploy করলে Android Chrome থেকে Install app ব্যবহার করা যায়।
Native APK-এর জন্য Android Studio + Android SDK + Capacitor setup, app signing, device testing প্রয়োজন। এই পরিবেশে Android SDK/Gradle build নেই, তাই APK binary তৈরি করা হয়নি।

## Security & business limitations
- Social password, OTP, recovery code, session cookie সংগ্রহ করা হয় না।
- Payment এখন manual; transaction ID কেবল reference। টাকা পাওয়া গেছে কিনা merchant/bank app-এ যাচাই করতে হবে।
- Payment gateway এবং Meta/Google/TikTok official ads APIs সংযুক্ত নয়। এসবের জন্য অনুমোদিত merchant account, platform approval, OAuth/business access ও API credentials দরকার।
- Public order lookup phone/order ID দিয়ে হয়; production-এ OTP verification যোগ করুন।
- Production-এর আগে HTTPS reverse proxy, firewall, backups, monitoring, database migration, MFA, CSRF strategy, stronger validation, duplicate transaction checks, privacy policy, terms, refund policy এবং independent security review যোগ করুন।
- Seed prices are sample prices from the requested coin menu; confirm before accepting real orders.
