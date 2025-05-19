package web

import (
	"html/template"
	"net/http"
	"sync"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
)

var (
	tmplIndex = template.Must(template.New("index").Parse(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Day44 - 仮想ルーター管理</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100">
  <div class="container mx-auto p-4">
    <h1 class="text-2xl font-bold mb-4">仮想ルーター一覧</h1>
    <form method="POST" action="/add" class="mb-4 flex gap-2">
      <input name="id" placeholder="ID" class="border p-1 rounded" required>
      <input name="name" placeholder="名前" class="border p-1 rounded" required>
      <input name="ip" placeholder="IP" class="border p-1 rounded" required>
      <button class="bg-blue-500 text-white px-3 py-1 rounded">追加</button>
    </form>
    <table class="min-w-full bg-white rounded shadow">
      <thead><tr><th>ID</th><th>名前</th><th>IP</th><th>操作</th></tr></thead>
      <tbody>
        {{range .Routers}}
        <tr class="border-b">
          <td class="p-2">{{.ID}}</td>
          <td class="p-2">{{.Name}}</td>
          <td class="p-2">{{.IP}}</td>
          <td class="p-2">
            <form method="POST" action="/delete" style="display:inline">
              <input type="hidden" name="id" value="{{.ID}}">
              <button class="bg-red-500 text-white px-2 py-1 rounded">削除</button>
            </form>
          </td>
        </tr>
        {{end}}
      </tbody>
    </table>
  </div>
</body>
</html>
`))
)

type WebServer struct {
	Mgr *router.RouterManager
	mu  sync.Mutex
}

func (ws *WebServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/":
		ws.handleIndex(w, r)
	case "/add":
		ws.handleAdd(w, r)
	case "/delete":
		ws.handleDelete(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (ws *WebServer) handleIndex(w http.ResponseWriter, r *http.Request) {
	ws.mu.Lock()
	defer ws.mu.Unlock()
	tmplIndex.Execute(w, struct{ Routers []*router.Router }{
		Routers: ws.getRouters(),
	})
}

func (ws *WebServer) handleAdd(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	id := r.FormValue("id")
	name := r.FormValue("name")
	ip := r.FormValue("ip")
	if id != "" && name != "" && ip != "" {
		ws.Mgr.AddRouter(router.RouterID(id), name, ip)
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (ws *WebServer) handleDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	id := r.FormValue("id")
	if id != "" {
		ws.Mgr.RemoveRouter(router.RouterID(id))
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (ws *WebServer) getRouters() []*router.Router {
	ws.Mgr.Mu().RLock()
	defer ws.Mgr.Mu().RUnlock()
	list := []*router.Router{}
	for _, r := range ws.Mgr.Routers {
		list = append(list, r)
	}
	return list
}
