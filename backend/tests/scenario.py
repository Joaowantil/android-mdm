"""Roteiro de regressão ponta a ponta (TestClient). Roda contra o banco definido em
DATABASE_URL (SQLite ou PostgreSQL) e imprime o que passou/falhou.

  DATABASE_URL=postgresql+asyncpg://mdm:senha@127.0.0.1:5432/mdm python tests/scenario.py
"""
import os, sys, time
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-scenario")
os.environ.setdefault("BACKGROUND_WORKERS_ENABLED", "false")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
import app.api.routes.devices as devices_routes
from app.main import app


async def _no_geocode(lat, lng):  # evita chamada de rede externa nos testes
    return None
devices_routes.reverse_geocode = _no_geocode

results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("OK    " if cond else "FALHA ") + name + (f"  [{extra}]" if (extra and not cond) else ""))

def enroll(client, h, device_id):
    tok = client.get("/api/devices/enrollment-token", headers=h).json()["enrollment_token"]
    r = client.post("/api/devices/enroll", json={"device_id": device_id, "enrollment_token": tok,
                    "model": "TC", "manufacturer": "Zebra", "os_version": "8.1"})
    secret = r.json().get("device_secret")
    pk = [d["id"] for d in client.get("/api/devices", headers=h).json() if d["device_id"] == device_id][0]
    return pk, secret

with TestClient(app, raise_server_exceptions=False) as c:
    # --- login / sessão
    r = c.post("/api/auth/login", json={"email": "admin@mdm.local", "password": "admin123"})
    check("login admin", r.status_code == 200, r.text[:120])
    H = {"Authorization": f"Bearer {r.json()['access_token']}"}
    check("auth/me", c.get("/api/auth/me", headers=H).status_code == 200)

    # --- auditoria de login falho (suspeita: rollback apaga o registro)
    c.post("/api/auth/login", json={"email": "admin@mdm.local", "password": "errada-errada"})
    logs = c.get("/api/audit-logs", headers=H, params={"action": "auth.login_failed"}).json()
    check("login FALHO fica registrado no log de auditoria", len(logs) >= 1, f"registros={len(logs)}")

    # --- usuários: excluir usuário que tem sessão ativa (FK sessions.user_id)
    c.post("/api/users", json={"email": "op@teste.com", "password": "senha12345", "role": "operator"}, headers=H)
    ro = c.post("/api/auth/login", json={"email": "op@teste.com", "password": "senha12345"})
    HO = {"Authorization": f"Bearer {ro.json()['access_token']}"}
    uid = [u["id"] for u in c.get("/api/users", headers=H).json() if u["email"] == "op@teste.com"][0]
    check("operador tem sessão ativa", c.get("/api/devices", headers=HO).status_code == 200)
    rd = c.delete(f"/api/users/{uid}", headers=H)
    check("EXCLUIR usuário com sessão existente", rd.status_code == 200, f"HTTP {rd.status_code}")
    check("usuário excluído perdeu o acesso", c.get("/api/devices", headers=HO).status_code == 401)

    # --- grupos: excluir grupo com dispositivo dentro (FK devices.group_id)
    g = c.post("/api/groups", json={"name": "Loja 1"}, headers=H)
    check("criar grupo", g.status_code in (200, 201), g.text[:100])
    gid = g.json()["id"]
    pkA, secA = enroll(c, H, "dev-A")
    pkB, secB = enroll(c, H, "dev-B")
    check("enroll devolve device_secret", bool(secA and secB))
    check("mover device para o grupo", c.put(f"/api/devices/{pkA}", json={"group_id": gid}, headers=H).status_code == 200)
    rg = c.delete(f"/api/groups/{gid}", headers=H)
    check("EXCLUIR grupo com dispositivo", rg.status_code == 200, f"HTTP {rg.status_code}")
    check("device saiu do grupo", c.get(f"/api/devices/{pkA}", headers=H).json().get("group_id") is None)

    # --- heartbeat / comandos / localização
    hb = c.post("/api/devices/heartbeat", json={"device_id": "dev-A", "device_secret": secA,
                "battery_level": 80, "installed_apps": ["com.android.chrome", "com.mdm.agent"]})
    check("heartbeat", hb.status_code == 200, hb.text[:100])
    check("mensagem pop-up", c.post(f"/api/devices/{pkA}/message", json={"title": "T", "message": "oi"}, headers=H).status_code == 200)
    check("reiniciar", c.post(f"/api/devices/{pkA}/reboot", headers=H).status_code == 200)
    check("localizar", c.post(f"/api/devices/{pkA}/locate", headers=H).status_code == 200)
    rl = c.post("/api/devices/location", json={"device_id": "dev-A", "device_secret": secA, "latitude": -20.3, "longitude": -40.3})
    check("device envia localização", rl.status_code == 200, rl.text[:100])
    dev = c.get(f"/api/devices/{pkA}", headers=H).json()
    check("device aparece online e com bateria", dev.get("is_online") is True and dev.get("battery_level") == 80, str(dev.get("is_online")))
    check("timestamps vêm com fuso (Z/+00:00)", str(dev.get("last_seen", "")).endswith(("Z", "+00:00")), str(dev.get("last_seen")))

    # --- políticas + conformidade + exclusão de política com atribuição
    p = c.post("/api/policies", json={"name": "Sem Chrome", "policy_type": "app_blocklist", "app_list": ["com.android.chrome"]}, headers=H)
    check("criar política", p.status_code in (200, 201), p.text[:100])
    pid = p.json()["id"]
    check("atribuir política", c.post(f"/api/policies/{pid}/assign", json={"device_ids": [pkA]}, headers=H).status_code == 200)
    viol = c.get("/api/compliance/blocklist-violations", headers=H).json()
    check("conformidade acusa o Chrome no device A", len(viol) == 1 and viol[0]["violating_apps"] == ["com.android.chrome"])
    check("editar política (reenvia comando)", c.put(f"/api/policies/{pid}", json={"app_list": ["com.android.chrome", "x.y"]}, headers=H).status_code == 200)

    # --- EXCLUIR device com comandos e atribuição de política (FK commands/assignments)
    rdev = c.delete(f"/api/devices/{pkA}", params={"force": "true"}, headers=H)
    check("EXCLUIR device com comandos e políticas", rdev.status_code == 200, f"HTTP {rdev.status_code}")
    check("device A sumiu da lista", all(d["device_id"] != "dev-A" for d in c.get("/api/devices", headers=H).json()))

    # --- fluxo de liberação (release): ack apaga o device que ainda tem o comando
    c.post("/api/devices/heartbeat", json={"device_id": "dev-B", "device_secret": secB})
    rr = c.delete(f"/api/devices/{pkB}", headers=H)
    check("pedir liberação do device online", rr.status_code == 200 and rr.json().get("pending") is True, rr.text[:100])
    hb2 = c.post("/api/devices/heartbeat", json={"device_id": "dev-B", "device_secret": secB}).json()
    rel = [x for x in hb2.get("commands", []) if x["command_type"] == "release"]
    check("heartbeat entrega o comando release", len(rel) == 1)
    if rel:
        ra = c.post(f"/api/devices/command/{rel[0]['id']}/ack", json={"status": "executed", "device_secret": secB})
        check("ACK do release remove o device", ra.status_code == 200, f"HTTP {ra.status_code}")
        check("device B sumiu após o release", all(d["device_id"] != "dev-B" for d in c.get("/api/devices", headers=H).json()))

    # --- excluir política, sessões, auditoria
    check("excluir política", c.delete(f"/api/policies/{pid}", headers=H).status_code == 200)
    ss = c.get("/api/sessions", headers=H)
    check("listar sessões", ss.status_code == 200 and len(ss.json()) >= 1)
    check("auditoria lista ações", len(c.get("/api/audit-logs", headers=H).json()) >= 5)
    check("logout", c.post("/api/auth/logout", headers=H).status_code == 200)
    check("token pós-logout é rejeitado", c.get("/api/devices", headers=H).status_code == 401)

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} verificações passaram")
if failed:
    print("FALHAS:"); [print("  -", n) for n in failed]
sys.exit(1 if failed else 0)
