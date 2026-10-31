
============================================================
KAISE TEST KARNA HAI (step by step):
============================================================

1. npm run dev chalao, browser mein jao: http://localhost:5173/sitemap

   Ye ek page hai jisme SAARE routes clickable links ki tarah listed
   hain (Public / Candidate / Employer / Admin, 4 sections mein).

2. Bottom-left corner mein ek PEELA box dikhega "🛠 Dev: Login as"
   ye teen buttons dikhayega: Candidate / Employer / Admin / Logout

   - Candidate/Employer/Admin routes PROTECTED hain (login check karte
     hain) - isliye seedha click karoge to /login pe redirect ho
     jaoge, jab tak matching role select na karo.

3. Testing ka poora flow:
   a) Candidate ke saare pages check karne hain -> pehle peele box
      mein "Candidate" click karo -> phir /sitemap pe "Candidate"
      section ke saare links ek-ek karke click karo
   b) Employer pages ke liye -> "Employer" click karo -> Employer
      section ke links test karo
   c) Admin pages ke liye -> "Admin" click karo -> Admin section
      ke links test karo
   d) Public pages (Home, Jobs, Login, etc.) kabhi bhi bina login
      ke khulte hain

4. Footer ab bhi test kar sakte ho - Home page pe scroll down karke
   footer ke links pe click karo, ab wo sahi page pe jaenge (Privacy
   Policy aur Terms of Service abhi tak koi page nahi hai, wo "#"
   hi rahenge jab tak unhe banate nahi).

============================================================
IMPORTANT - PRODUCTION SE PEHLE:
============================================================
DevAuthSwitcher sirf TESTING ke liye hai - jab real login/backend
ready ho jaye, App.jsx se ye 2 lines hata dena:
  import DevAuthSwitcher from './components/common/DevAuthSwitcher';
  <DevAuthSwitcher />
aur src/components/common/DevAuthSwitcher.jsx file delete kar dena.
/sitemap route bhi hata sakte ho (optional, client ko dikhana nahi hai).
