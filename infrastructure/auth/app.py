import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List

import psycopg
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import jwt, JWTError
from passlib.context import CryptContext


PG_DSN = (
    f"dbname={os.getenv('PGDATABASE','dtp')} "
    f"user={os.getenv('PGUSER','dtp')} "
    f"password={os.getenv('PGPASSWORD','dtpsecret1')} "
    f"host={os.getenv('PGHOST','db')} "
    f"port={os.getenv('PGPORT','5432')}"
)

JWT_SECRET = os.getenv("JWT_SECRET", "devsecretjwt")
ALGO = "HS256"
EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "120"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


def _init_schema():
    with psycopg.connect(PG_DSN, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(
            """
            create table if not exists app_user(
              user_id uuid primary key default gen_random_uuid(),
              email text unique not null,
              password_hash text not null
            );
            create table if not exists twin_ui(
              twin_id uuid primary key,
              name text not null,
              ui_url text not null
            );
            create table if not exists user_twin(
              user_id uuid not null references app_user(user_id) on delete cascade,
              twin_id uuid not null references twin_ui(twin_id) on delete cascade,
              primary key (user_id, twin_id)
            );
            """
        )


def get_user_by_email(email: str):
    with psycopg.connect(PG_DSN) as conn, conn.cursor() as cur:
        cur.execute("select user_id, email, password_hash from app_user where email=%s", (email,))
        row = cur.fetchone()
        if not row:
            return None
        return {"user_id": row[0], "email": row[1], "password_hash": row[2]}


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=EXPIRE_MINUTES)
    to_encode = {"sub": sub, "exp": exp}
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGO)


def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
        sub: Optional[str] = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return sub
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


app = FastAPI(title="DTP Auth")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:8080").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    _init_schema()
    # Seed a demo user and twin if empty
    with psycopg.connect(PG_DSN, autocommit=True) as conn, conn.cursor() as cur:
        cur.execute("select count(*) from app_user")
        if cur.fetchone()[0] == 0:
            email = os.getenv("DEMO_USER_EMAIL", "demo@example.com")
            pw = os.getenv("DEMO_USER_PASSWORD", "demo12345")
            cur.execute(
                "insert into app_user(user_id,email,password_hash) values (gen_random_uuid(), %s, %s) on conflict do nothing",
                (email, pwd_context.hash(pw)),
            )
        cur.execute("select count(*) from twin_ui")
        if cur.fetchone()[0] == 0:
            # Example twin UI URLs (replace with your actual UI per twin)
            cur.execute(
                "insert into twin_ui(twin_id,name,ui_url) values (gen_random_uuid(), %s, %s), (gen_random_uuid(), %s, %s)",
                ("Room 1", "http://localhost:7474", "Room 2", "http://localhost:7474"),
            )
        # Map the first user to all twins for demo
        cur.execute("""
            insert into user_twin(user_id, twin_id)
            select u.user_id, t.twin_id
            from app_user u cross join twin_ui t
            on conflict do nothing
        """)


@app.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = get_user_by_email(form_data.username)
    if not user or not verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    token = create_access_token(user["user_id"])
    return {"access_token": token, "token_type": "bearer"}


@app.get("/api/me/twins")
def my_twins(user_id: str = Depends(get_current_user_id)):
    with psycopg.connect(PG_DSN) as conn, conn.cursor() as cur:
        cur.execute(
            """
            select t.twin_id::text, t.name, t.ui_url
            from user_twin ut
            join twin_ui t on t.twin_id = ut.twin_id
            where ut.user_id = %s
            order by t.name
            """,
            (user_id,),
        )
        rows = cur.fetchall()
    return [{"twin_id": r[0], "name": r[1], "ui_url": r[2]} for r in rows]


@app.get("/api/healthz")
def healthz():
    return {"ok": True}

