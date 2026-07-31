/**
 * Usuários provisionados pelo master (além do MASTER_EMAIL env).
 * Disco: data/users.json (gitignored).
 */

import fs from "fs";
import path from "path";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getMasterCredentials } from "@/lib/auth/session";

export type StoredUser = {
  email: string;
  passwordHash: string;
  createdAt: string;
  active: boolean;
  name?: string;
};

export type PublicUser = {
  email: string;
  createdAt: string;
  active: boolean;
  name?: string;
};

type FileShape = {
  users: StoredUser[];
};

function resolveStorePath() {
  if (process.env.USERS_PATH) return process.env.USERS_PATH;
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "users.json",
  );
}

function readFile(): FileShape {
  const STORE_PATH = resolveStorePath();
  try {
    if (!fs.existsSync(STORE_PATH)) return { users: [] };
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, "utf8")) as FileShape;
    return {
      users: Array.isArray(raw.users) ? raw.users : [],
    };
  } catch (err) {
    console.error("[users-store] read failed", resolveStorePath(), err);
    return { users: [] };
  }
}

function writeFileAtomic(data: FileShape) {
  const STORE_PATH = resolveStorePath();
  const dir = path.dirname(STORE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, STORE_PATH);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toPublic(u: StoredUser): PublicUser {
  return {
    email: u.email,
    createdAt: u.createdAt,
    active: u.active !== false,
    name: u.name,
  };
}

export function isMasterEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return normalizeEmail(email) === getMasterCredentials().email;
}

export function listUsers(): PublicUser[] {
  return readFile()
    .users.map(toPublic)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function findUser(email: string): StoredUser | null {
  const key = normalizeEmail(email);
  return readFile().users.find((u) => u.email === key) ?? null;
}

export async function createUser(input: {
  email: string;
  password: string;
  name?: string;
}): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const email = normalizeEmail(input.email || "");
  const password = input.password ?? "";
  const name = input.name?.trim() || undefined;

  if (!isValidEmail(email)) {
    return { ok: false, error: "E-mail inválido." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Senha deve ter pelo menos 8 caracteres." };
  }
  if (isMasterEmail(email)) {
    return { ok: false, error: "Este e-mail é o master do sistema." };
  }

  const data = readFile();
  if (data.users.some((u) => u.email === email)) {
    return { ok: false, error: "Já existe um usuário com este e-mail." };
  }

  const user: StoredUser = {
    email,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    active: true,
    name,
  };
  data.users.push(user);
  writeFileAtomic(data);
  return { ok: true, user: toPublic(user) };
}

export async function setUserActive(
  email: string,
  active: boolean,
): Promise<{ ok: true; user: PublicUser } | { ok: false; error: string }> {
  const key = normalizeEmail(email);
  const data = readFile();
  const idx = data.users.findIndex((u) => u.email === key);
  if (idx < 0) return { ok: false, error: "Usuário não encontrado." };
  data.users[idx] = { ...data.users[idx]!, active };
  writeFileAtomic(data);
  return { ok: true, user: toPublic(data.users[idx]!) };
}

export async function deleteUser(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = normalizeEmail(email);
  const data = readFile();
  const next = data.users.filter((u) => u.email !== key);
  if (next.length === data.users.length) {
    return { ok: false, error: "Usuário não encontrado." };
  }
  writeFileAtomic({ users: next });
  return { ok: true };
}

/** Credencial de usuário do store (não master). */
export async function verifyStoredUserCredentials(
  email: string,
  password: string,
): Promise<{ ok: true; email: string } | { ok: false }> {
  const user = findUser(email);
  if (!user || user.active === false) return { ok: false };
  const match = await verifyPassword(password, user.passwordHash);
  if (!match) return { ok: false };
  return { ok: true, email: user.email };
}
