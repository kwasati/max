# MaxMahon Auth Setup — Runbook

How to set up Google OAuth + Supabase Hub auth for MaxMahon. Run these steps in order.

## 1. Google Cloud Console — OAuth 2.0 client

- Open https://console.cloud.google.com/
- Pick (or create) a project to host the OAuth client
- Go to APIs & Services → Credentials
- Click "Create Credentials" → "OAuth client ID"
- Application type: **Web application**
- Name: "MaxMahon Supabase OAuth"
- Authorized redirect URIs — add exactly:
  - `https://zmscqylztzvzeyxwamzp.supabase.co/auth/v1/callback`
- Save → copy **Client ID** + **Client Secret** (use in step 2)

## 2. Supabase Dashboard — Provider + URL config

Project URL: https://supabase.com/dashboard/project/zmscqylztzvzeyxwamzp

### 2.1 Enable Google provider
- Authentication → Providers → Google → toggle **Enable**
- Paste Client ID + Client Secret from step 1
- Save

### 2.2 URL Configuration
- Authentication → URL Configuration
- **Site URL:** `https://max.intensivetrader.com`
- **Additional Redirect URLs** (add all 4):
  - `https://max.intensivetrader.com/login`
  - `https://max.intensivetrader.com/m/login`
  - `http://localhost:50089/login`
  - `http://localhost:50089/m/login`
- Save

## 3. Extract JWT Secret → `.env`

- Settings → API → JWT Settings
- Copy "JWT Secret" (HS256 key, ~40+ chars)
- Add to `C:/WORKSPACE/.env`:
  ```
  SUPABASE_HUB_JWT_SECRET=<paste>
  ```
- Verify: `py -c "import os, dotenv; dotenv.load_dotenv(); print(len(os.environ['SUPABASE_HUB_JWT_SECRET']) > 30)"` → `True`

## 4. Extract Anon Key → `.env`

- Settings → API → Project API keys
- Copy "anon" "public" key (long JWT-looking string starting with `eyJ`)
- Add to `C:/WORKSPACE/.env`:
  ```
  SUPABASE_HUB_ANON_KEY=<paste>
  ```
- This key is public-safe — embedding in client JS is fine (Supabase RLS + MaxMahon backend whitelist protect data).
- Verify: `py -c "import os, dotenv; dotenv.load_dotenv(); print(os.environ['SUPABASE_HUB_ANON_KEY'].startswith('eyJ'))"` → `True`

## 5. `MAXMAHON_ALLOWED_USERS` format

JSON array in `.env`. Each user has `email`, `role` (`admin` or `viewer`), and `name`:

```
MAXMAHON_ALLOWED_USERS=[{"email":"kwasati@gmail.com","role":"admin","name":"อาร์ท"},{"email":"<wife-real-email>","role":"viewer","name":"น้องเมีย"}]
```

**To add a new user:** append another object to the array. Restart server after changing.

Verify: `py -c "import os, json, dotenv; dotenv.load_dotenv(); u=json.loads(os.environ['MAXMAHON_ALLOWED_USERS']); print(len(u)>=2 and any(x['role']=='admin' for x in u))"` → `True`

## 6. JWT Secret rotation

If the JWT secret leaks or you want to rotate:

1. Supabase Dashboard → Settings → API → JWT Settings → "Regenerate JWT Secret"
2. Copy the new secret → update `SUPABASE_HUB_JWT_SECRET` in `.env`
3. Restart MaxMahon server (`max-server.bat`)
4. **All existing sessions are invalidated** — users must sign in again.

## 7. Find Karl's UUID after first login (for Plan 02 migration)

After Karl signs in once via Google, Supabase creates a UUID for him. Plan 02's migration script needs this UUID.

**Method A — from smoke test:**
1. Karl opens `projects/MaxMahon/scripts/auth_smoke_test.html` in browser
2. Click "Sign in with Google" → complete OAuth → return
3. Decoded payload prints — copy `user_id` field

**Method B — from Supabase Dashboard:**
1. Supabase Dashboard → Authentication → Users
2. Click `kwasati@gmail.com` row
3. Copy "User UID"

Use UUID with: `py scripts/migrate_to_per_user.py --user-id <uuid>`
