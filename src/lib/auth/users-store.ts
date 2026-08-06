/**
 * Usuários provisionados pelo master (além do MASTER_EMAIL env).
 * Disco: data/users.json (gitignored).
 */

import fs from "fs";
import path from "path";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getMasterCredentials } from "@/lib/auth/session";

export type UserRole = "user" | "master";

export type StoredUser = {
  email: string;
  passwordHash: string;
  createdAt: string;
  active: boolean;
  name?: string;
  /** Master tem acesso a todos os filtros inseridos pelo admin, sem restrição de faixa de crédito. */
  role?: UserRole;
  /** Teste grátis 48h — data de ativação. Só pode ser ativado 1x por usuário, para sempre. */
  trialStartedAt?: string;
  /** E-mail do afiliado que indicou este usuário (código ref). */
  referredBy?: string;
  /** Código único de afiliado deste usuário (gerado no primeiro acesso). */
  referralCode?: string;
};

export type PublicUser = {
  email: string;
  createdAt: string;
  active: boolean;
  name?: string;
  role: UserRole;
  trialStartedAt?: string | null;
};

/**
 * Masters extras além do MASTER_EMAIL (env) e do users.json com role "master".
 * Garante o acesso deste e-mail independente de configuração de ambiente.
 */
const ADDITIONAL_MASTER_EMAILS = new Set(["isaacgomes3@gmail.com"]);

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
    role: isMasterEmail(u.email) ? "master" : "user",
    trialStartedAt: u.trialStartedAt ?? null,
  };
}

/**
 * Master = e-mail do env (MASTER_EMAIL), e-mails extras garantidos no código
 * (isaacgomes3@gmail.com) ou usuário provisionado com role "master".
 */
export function isMasterEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const key = normalizeEmail(email);
  if (key === getMasterCredentials().email) return true;
  if (ADDITIONAL_MASTER_EMAILS.has(key)) return true;
  const stored = readFile().users.find((u) => u.email === key);
  return Boolean(stored && stored.role === "master");
}

/** Concede/revoga o papel de master a um usuário provisionado (não o env master). */
export function setUserRole(
  email: string,
  role: UserRole,
): { ok: true; user: PublicUser } | { ok: false; error: string } {
  const key = normalizeEmail(email);
  if (key === getMasterCredentials().email || ADDITIONAL_MASTER_EMAILS.has(key)) {
    return { ok: false, error: "Este e-mail já é master pelo sistema." };
  }
  const data = readFile();
  const idx = data.users.findIndex((u) => u.email === key);
  if (idx < 0) return { ok: false, error: "Usuário não encontrado." };
  data.users[idx] = { ...data.users[idx]!, role };
  writeFileAtomic(data);
  return { ok: true, user: toPublic(data.users[idx]!) };
}

/** Data (ISO) em que o usuário ativou o teste grátis — null se nunca ativou. */
export function getUserTrialStartedAt(email: string): string | null {
  return findUser(email)?.trialStartedAt ?? null;
}

/**
 * Ativa o teste grátis 48h para o usuário — 1x só, para sempre. Ativação é
 * feita pelo próprio usuário no seu ambiente (dashboard/config).
 */
export function activateUserTrial(
  email: string,
): { ok: true; startedAt: string } | { ok: false; error: string } {
  const key = normalizeEmail(email);
  if (isMasterEmail(key)) {
    return { ok: false, error: "Master já tem acesso completo aos filtros." };
  }
  const data = readFile();
  const idx = data.users.findIndex((u) => u.email === key);
  if (idx < 0) return { ok: false, error: "Usuário não encontrado." };
  const existing = data.users[idx]!;
  if (existing.trialStartedAt) {
    return { ok: false, error: "O teste grátis de 48h já foi utilizado." };
  }
  const startedAt = new Date().toISOString();
  data.users[idx] = { ...existing, trialStartedAt: startedAt };
  writeFileAtomic(data);
  return { ok: true, startedAt };
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

/** Gera ou obtém o código de afiliado de um usuário (persiste no users.json). */
export function ensureReferralCode(email: string): string {
  const key = normalizeEmail(email);
  const data = readFile();
  const idx = data.users.findIndex((u) => u.email === key);
  if (idx < 0) return Buffer.from(key).toString("base64url");
  if (data.users[idx]!.referralCode) return data.users[idx]!.referralCode!;
  const code = Buffer.from(key).toString("base64url");
  data.users[idx] = { ...data.users[idx]!, referralCode: code };
  writeFileAtomic(data);
  return code;
}

/** Resolve o e-mail do afiliado a partir do código. */
export function resolveReferralCode(code: string): string | null {
  try {
    const email = Buffer.from(code, "base64url").toString("utf8");
    if (!isValidEmail(email)) return null;
    const data = readFile();
    const found = data.users.find((u) => u.email === email) ||
      (isMasterEmail(email) ? { email } : null);
    return found ? email : null;
  } catch {
    return null;
  }
}

/** Lista de usuários indicados por um afiliado. */
export function getReferrals(affiliateEmail: string): PublicUser[] {
  const key = normalizeEmail(affiliateEmail);
  return readFile()
    .users.filter((u) => u.referredBy === key)
    .map(toPublic)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function createUser(input: {
  email: string;
  password: string;
  name?: string;
  referredBy?: string;
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

  const referredBy = input.referredBy
    ? normalizeEmail(input.referredBy)
    : undefined;

  const user: StoredUser = {
    email,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    active: true,
    name,
    ...(referredBy ? { referredBy } : {}),
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
