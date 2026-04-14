"""
ComunitatES · Generació Distribuïda
Servidor FastAPI — Login · CRUD · Càlculs d'estalvi
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json, pathlib, hashlib, hmac, time, base64, os

# ────────────────────────────────────────────
app = FastAPI(title="ComunitatES API", version="1.0.0", docs_url="/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory="static"), name="static")

DATA_FILE = pathlib.Path("data/data.json")
SECRET    = os.getenv("SECRET_KEY", "comunitates-generacio-distribuida-2025")

# ────────────────────────────────────────────
#  AUTH  (HMAC token, sense llibreries externes)
# ────────────────────────────────────────────
def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def _make_token(username: str, role: str) -> str:
    ts      = str(int(time.time()))
    payload = f"{username}:{role}:{ts}"
    sig     = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()

def _verify_token(token: str) -> Optional[dict]:
    try:
        raw      = base64.urlsafe_b64decode(token.encode()).decode()
        *parts, sig = raw.split(":")
        payload  = ":".join(parts)
        username, role, ts = parts[0], parts[1], parts[2]
        expected = hmac.new(SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:24]
        if expected == sig and time.time() - int(ts) < 604800:   # 7 dies
            return {"username": username, "role": role}
    except Exception:
        pass
    return None

bearer = HTTPBearer()

def require_auth(creds: HTTPAuthorizationCredentials = Depends(bearer)):
    user = _verify_token(creds.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Token invàlid o caducat")
    return user

# ────────────────────────────────────────────
#  DATA HELPERS
# ────────────────────────────────────────────
def rdata() -> dict:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))

def wdata(d: dict):
    DATA_FILE.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")

def _recalc(data: dict, comm_id: str):
    """Recalcula totals de la comunitat a partir dels seus clients."""
    cc   = [c for c in data["clients"] if c["comunitat"] == comm_id]
    comm = next((c for c in data["communities"] if c["id"] == comm_id), None)
    if not comm:
        return
    comm["total_clients"]  = len(cc)
    comm["total_kw"]       = round(sum(c.get("kw", 0) for c in cc), 2)
    comm["total_estalvi"]  = round(sum(c.get("estalvi_brut", 0) for c in cc), 2)
    comm["clients_actius"] = sum(1 for c in cc if c.get("estat") == "Actiu")
    comm["inscrits"]       = sum(1 for c in cc if c.get("estat") in ("Actiu","Proposat"))
    comm["sense_auth"]     = sum(1 for c in cc if c.get("cups_auth") == "Falten")

# ────────────────────────────────────────────
#  MODELS
# ────────────────────────────────────────────
class LoginReq(BaseModel):
    username: str
    password: str

class Community(BaseModel):
    id: str
    nom: str
    promotor: str
    contacte:        Optional[str]   = ""
    email:           Optional[str]   = ""
    telefon:         Optional[str]   = ""
    adreca:          Optional[str]   = ""
    potencia:        Optional[str]   = ""
    onboarding:      Optional[str]   = "Obert"
    acord_reparto:   Optional[str]   = "Pendent"
    fi_inscripcions: Optional[str]   = ""
    informe_auto:    Optional[str]   = "Sense informe auto"
    marca_blanca:    Optional[str]   = "No activada"
    lat:             Optional[float] = 41.5
    lng:             Optional[float] = 2.0
    color:           Optional[str]   = "#1B4D31"
    clients_actius:  Optional[int]   = 0
    inscrits:        Optional[int]   = 0
    cups_auth_actius:Optional[int]   = 0
    cups_auth_proposats: Optional[int] = 0
    sense_auth:      Optional[int]   = 0
    datadis_actius:  Optional[int]   = 0
    autoconsumos:    Optional[str]   = "0/0"
    clients_app:     Optional[int]   = 0
    sense_dades:     Optional[int]   = 0
    sol_licituds:    Optional[int]   = 0
    total_estalvi:   Optional[float] = 0
    total_kw:        Optional[float] = 0
    total_clients:   Optional[int]   = 0

class Client(BaseModel):
    codi:          str
    nom:           str
    comunitat:     str
    nif:           Optional[str]   = ""
    cups:          Optional[str]   = "—"
    tel:           Optional[str]   = ""
    email:         Optional[str]   = ""
    inici_fact:    Optional[str]   = "-"
    baixa:         Optional[str]   = "-"
    app:           Optional[str]   = "No"
    estat:         Optional[str]   = "Proposat"
    modalitat:     Optional[str]   = "Ahorra sempre"
    perfil:        Optional[str]   = "F"
    comercialitz:  Optional[str]   = ""
    import_eur:    Optional[float] = 0
    kw:            Optional[float] = 0
    kwh:           Optional[float] = 0
    preu_llum:     Optional[float] = 0
    estalvi_brut:  Optional[float] = 0
    cost_fix:      Optional[float] = 0
    preu_kwh:      Optional[float] = 0.088
    pct_estalvi:   Optional[float] = None
    periode:       Optional[int]   = 0
    distribuidora: Optional[str]   = "031"
    cups_auth:     Optional[str]   = "Falten"
    cups_auth_note:Optional[str]   = ""
    autoconsum:    Optional[str]   = "-"
    datadis:       Optional[str]   = "Actiu"
    dades_recents: Optional[str]   = "Sense dades"
    sense_auto:    Optional[str]   = "OK"

class EstalviReq(BaseModel):
    preu_llum:      float
    preu_kwh_part:  float = 0.088
    kwh_anuals:     float
    kw_assignats:   float

# ────────────────────────────────────────────
#  RUTES PÚBLIQUES
# ────────────────────────────────────────────
@app.get("/", include_in_schema=False)
def root():
    return FileResponse("static/index.html")

@app.get("/health")
def health():
    return {"status": "ok", "service": "ComunitatES", "version": "1.0.0"}

@app.post("/api/login")
def login(req: LoginReq):
    data  = rdata()
    users = data.get("users", [])
    user  = next((u for u in users if u["username"] == req.username), None)
    if not user or user["password"] != _hash(req.password):
        raise HTTPException(401, "Usuari o contrasenya incorrectes")
    token = _make_token(user["username"], user.get("role", "admin"))
    return {
        "token":    token,
        "username": user["username"],
        "role":     user.get("role", "admin"),
        "nom":      user.get("nom", user["username"]),
    }

# ────────────────────────────────────────────
#  RUTES PROTEGIDES
# ────────────────────────────────────────────
@app.get("/api/data")
def get_data(user=Depends(require_auth)):
    data = rdata()
    return {
        "communities": data.get("communities", []),
        "clients":     data.get("clients", []),
    }

@app.get("/api/stats")
def get_stats(user=Depends(require_auth)):
    data  = rdata()
    comms = data.get("communities", [])
    clis  = data.get("clients", [])
    return {
        "total_communities": len(comms),
        "total_clients":     len(clis),
        "total_kw":          round(sum(c.get("total_kw", 0) for c in comms), 1),
        "total_estalvi":     round(sum(c.get("total_estalvi", 0) for c in comms), 2),
        "clients_actius":    sum(1 for c in clis if c.get("estat") == "Actiu"),
        "clients_proposats": sum(1 for c in clis if c.get("estat") == "Proposat"),
        "clients_reserva":   sum(1 for c in clis if c.get("estat") == "Reserva"),
        "sense_auth":        sum(1 for c in clis if c.get("cups_auth") == "Falten"),
        "acords_pendents":   sum(1 for c in comms if c.get("acord_reparto") == "Pendent"),
    }

# ── Communities CRUD ──
@app.post("/api/communities", status_code=201)
def create_community(comm: Community, user=Depends(require_auth)):
    data = rdata()
    if any(c["id"] == comm.id for c in data["communities"]):
        raise HTTPException(400, f"Ja existeix una comunitat amb ID {comm.id}")
    data["communities"].append(comm.model_dump())
    wdata(data)
    return comm

@app.put("/api/communities/{comm_id}")
def update_community(comm_id: str, comm: Community, user=Depends(require_auth)):
    data = rdata()
    idx  = next((i for i, c in enumerate(data["communities"]) if c["id"] == comm_id), None)
    if idx is None:
        raise HTTPException(404, "Comunitat no trobada")
    data["communities"][idx] = comm.model_dump()
    _recalc(data, comm_id)
    wdata(data)
    return data["communities"][idx]

@app.delete("/api/communities/{comm_id}")
def delete_community(comm_id: str, user=Depends(require_auth)):
    data = rdata()
    data["communities"] = [c for c in data["communities"] if c["id"] != comm_id]
    data["clients"]     = [c for c in data["clients"]     if c["comunitat"] != comm_id]
    wdata(data)
    return {"ok": True}

# ── Clients CRUD ──
@app.post("/api/clients", status_code=201)
def create_client(client: Client, user=Depends(require_auth)):
    data = rdata()
    if any(c["codi"] == client.codi for c in data["clients"]):
        raise HTTPException(400, f"Ja existeix un client amb codi {client.codi}")
    data["clients"].append(client.model_dump())
    _recalc(data, client.comunitat)
    wdata(data)
    return client

@app.put("/api/clients/{codi}")
def update_client(codi: str, client: Client, user=Depends(require_auth)):
    data     = rdata()
    idx      = next((i for i, c in enumerate(data["clients"]) if c["codi"] == codi), None)
    if idx is None:
        raise HTTPException(404, "Client no trobat")
    old_comm = data["clients"][idx].get("comunitat")
    data["clients"][idx] = client.model_dump()
    _recalc(data, client.comunitat)
    if old_comm and old_comm != client.comunitat:
        _recalc(data, old_comm)
    wdata(data)
    return data["clients"][idx]

@app.delete("/api/clients/{codi}")
def delete_client(codi: str, user=Depends(require_auth)):
    data   = rdata()
    client = next((c for c in data["clients"] if c["codi"] == codi), None)
    if client:
        data["clients"] = [c for c in data["clients"] if c["codi"] != codi]
        _recalc(data, client["comunitat"])
        wdata(data)
    return {"ok": True}

# ── Càlcul d'estalvi ──
@app.post("/api/calcular-estalvi")
def calcular_estalvi(req: EstalviReq, user=Depends(require_auth)):
    """Calcula estalvi estimat per a un participant."""
    cost_fix     = req.kw_assignats * 12          # 1 €/kW/mes
    estalvi_brut = round((req.preu_llum - req.preu_kwh_part) * req.kwh_anuals, 2)
    estalvi_net  = round(estalvi_brut - cost_fix, 2)
    pct = round(estalvi_brut / (req.preu_llum * req.kwh_anuals) * 100, 1) \
          if req.preu_llum and req.kwh_anuals else 0
    co2_kg = round(req.kwh_anuals * 0.0005 * 1000, 1)
    return {
        "estalvi_brut":   estalvi_brut,
        "estalvi_net":    estalvi_net,
        "cost_fix_anual": cost_fix,
        "pct_estalvi":    pct,
        "co2_kg_evitat":  co2_kg,
    }
