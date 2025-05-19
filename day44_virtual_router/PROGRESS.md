# Day 44: Virtual Router with Next.js UI

## Progress

- [x] Step 1/5: Next.js frontend setup and API preparation
  - Copied template to `frontend` directory.
  - Configured `package.json` for the frontend.
  - Introduced `gorilla/mux` to the Go backend.
  - Added initial API endpoints for topology and router details (`/api/topology`, `/api/router/{id}`).
  - Basic `fetch` in Next.js `page.tsx` to test API connection.
  - Troubleshot Next.js startup issues (Turbopack, directory paths, dependency reinstallation).
- [x] Step 2/5: Implement Router and Link Management APIs (POST/DELETE for routers and links)
  - Added POST /api/router (addRouterHandler)
  - Added DELETE /api/router/{id} (deleteRouterHandler)
  - Added POST /api/link (addLinkHandler)
  - Added DELETE /api/link (deleteLinkHandler)
  - Resolved linter errors related to handler implementation and registration.
- [x] Step 3/5: Implement Ping API (POST /api/router/{id}/ping)
  - Added SimulatePing method to router.Router
  - Added POST /api/router/{id}/ping (pingAPIHandler)
- [ ] Step 4/5: Develop Frontend UI with React Flow for Network Visualization
- [ ] Step 5/5: Implement Frontend Controls for Router/Link Management and Ping Execution

# 進捗

以下に進捗を記載してください。


- [x] ルーター・リンクの追加・削除UI (Step 7)
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ]
