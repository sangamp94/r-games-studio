# R GAMES STUDIO + Neon Login/Register

Frontend: `index.html` (single page). Backend: `api/` (Vercel serverless functions). Database: Neon Postgres.

## Setup (5 steps)

1. **Neon table banao**: Neon dashboard -> SQL Editor -> `schema.sql` ka poora content paste karke Run karo.
2. **Neon connection string copy karo**: Dashboard -> Connection Details.
3. **GitHub pe push karo** (ye poora folder), phir **Vercel** me import karo.
4. Vercel -> Settings -> **Environment Variables** me ye 3 daalo (dekho `.env.example`):
   - `DATABASE_URL`  = Neon connection string
   - `JWT_SECRET`    = `openssl rand -hex 32` ka output
   - `SETUP_KEY`     = koi lamba secret (sirf pehla owner account banane ke liye)
5. Deploy karo. Phir site kholo, **Ctrl+Shift+A** dabao (admin login). Pehli baar "Create Owner Account" dikhega: email, password aur SETUP_KEY daalo.

## Local testing

```
npm i -g vercel
npm install
cp .env.example .env.local   # values bharo
vercel dev
```

Sirf `index.html` double-click karke kholne par `/api` kaam nahi karega.

## API

| Endpoint | Kaam |
|---|---|
| `GET  /api/status` | Owner bana hai ya nahi |
| `POST /api/register` | Naya account (role `user`). `setupKey` ke saath pehla `owner` |
| `POST /api/login` | Login (5 galat attempts par 15 min lock) |
| `GET  /api/me` | Current session ka user |
| `POST /api/logout` | Logout |
| `POST /api/change-password` | Password badalna (signed-in user) |

## Zaroori: purana Firestore admin data delete karo

Purana version owner ka email + password-hash Firestore me
`artifacts/r-games-studio-prod/public/data/admins/owner_account` par rakhta tha. Ye ab use nahi hota.
Firebase console se wo document **delete** kar do.

## Baaki security

Games ka data abhi bhi Firestore me hai. Agar Firestore rules open hain to koi bhi direct games
likh/delete kar sakta hai. Rules lock karo ya games ko bhi Neon me shift karo.
