# TIC Client setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_API_URL` to the full public TIC API URL, including `/api/v2/tic` (for example, `https://act-api-staging.globalvisionsinc.com.ph/api/v2/tic`). The browser calls this URL directly; do not configure a Vercel `/api` rewrite or use a relative URL.
3. To enable Microsoft SSO, configure `NEXT_PUBLIC_MICROSOFT_TENANT_ID` and `NEXT_PUBLIC_MICROSOFT_CLIENT_ID`.
4. Run `npm run dev`.

The backend remains the authorization authority. Frontend navigation visibility is only a usability feature and is not used as a security boundary.

