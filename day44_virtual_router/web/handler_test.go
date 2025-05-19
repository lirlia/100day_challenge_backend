package web

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
)

func TestWebServer_Index(t *testing.T) {
	mgr := router.NewRouterManager()
	mgr.AddRouter("r1_webtest", "WebRouter1", "10.0.2.1")
	ws := &WebServer{Mgr: mgr}

	req := httptest.NewRequest("GET", "/", nil)
	rr := httptest.NewRecorder()
	ws.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("ハンドラが不正なステータスコードを返しました: got %v want %v", status, http.StatusOK)
	}

	body := rr.Body.String()
	if !strings.Contains(body, "WebRouter1") {
		t.Errorf("レスポンスボディにルーター名が含まれていません: %s", body)
	}
}

func TestWebServer_AddDeleteRouter(t *testing.T) {
	mgr := router.NewRouterManager()
	ws := &WebServer{Mgr: mgr}

	// ルーター追加
	addReq := httptest.NewRequest("POST", "/add", strings.NewReader("id=r_add_test&name=AddTestRouter&ip=10.0.3.1"))
	addReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	addRr := httptest.NewRecorder()
	ws.ServeHTTP(addRr, addReq)

	if status := addRr.Code; status != http.StatusSeeOther {
		t.Errorf("追加ハンドラが不正なステータスコードを返しました: got %v want %v", status, http.StatusSeeOther)
	}
	if len(mgr.Routers) != 1 {
		t.Errorf("ルーター追加後、ルーター数が期待値と異なる: got %d, want 1", len(mgr.Routers))
	}

	// ルーター削除
	delReq := httptest.NewRequest("POST", "/delete", strings.NewReader("id=r_add_test"))
	delReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	delRr := httptest.NewRecorder()
	ws.ServeHTTP(delRr, delReq)

	if status := delRr.Code; status != http.StatusSeeOther {
		t.Errorf("削除ハンドラが不正なステータスコードを返しました: got %v want %v", status, http.StatusSeeOther)
	}
	if len(mgr.Routers) != 0 {
		t.Errorf("ルーター削除後、ルーター数が期待値と異なる: got %d, want 0", len(mgr.Routers))
	}
}
