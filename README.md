# R GAMES STUDIO + Turso Login/Register

Frontend: `index.html` (single page). Backend: `api/` (Vercel serverless functions). Database: Turso (libSQL/SQLite).

## Setup

1. **GitHub pe push karo** (ye poora folder), phir **Vercel** me import karo.
2. Vercel -> Settings -> **Environment Variables** me ye 4 daalo (dekho `.env.example`):
   - `TURSO_DATABASE_URL` = `libsql://...turso.io`
   - `TURSO_AUTH_TOKEN`   = Turso ka token
   - `JWT_SECRET`         = `openssl rand -hex 32` ka output
   - `SETUP_KEY`          = koi lamba secret (sirf pehla owner account banane ke liye)
3. **Redeploy** karo.
4. `https://TUMHARI-SITE.vercel.app/api/status` kholo. `{"hasOwner":false}` aaye to sab theek hai.
   Tables API khud bana leti hai, SQL run karne ki zarurat nahi.
5. Site kholo, **Ctrl+Shift+A** dabao. "Create Owner Account" me email, password aur SETUP_KEY daalo.

## Local testing

```
npm install
cp .env.example .env.local   # values bharo (ya TURSO_DATABASE_URL=file:local.db)
npm i -g vercel
vercel dev
```

## API

| Endpoint | Kaam |
|---|---|
| `GET  /api/status` | Owner bana hai ya nahi (health check bhi) |
| `POST /api/register` | Naya account (role `user`). `setupKey` ke saath pehla `owner` |
| `POST /api/login` | Login (5 galat attempts par 15 min lock) |
| `GET  /api/me` | Current session ka user |
| `POST /api/logout` | Logout |
| `POST /api/change-password` | Password badalna (signed-in user) |

## Security notes

- Turso token kabhi code, GitHub ya chat me mat daalo. Sirf Vercel Environment Variables me rakho.
  Agar kahin share ho gaya ho to Turso dashboard se naya token banao aur purana revoke karo.
- Purana Firestore admin document delete karo:
  `artifacts/r-games-studio-prod/public/data/admins/owner_account`
- Games ka data abhi bhi Firestore me hai. Uske rules lock karo, warna koi bhi direct games
  likh/delete kar sakta hai.
